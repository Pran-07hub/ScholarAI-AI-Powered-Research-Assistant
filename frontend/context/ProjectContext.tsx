"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';

// Define the Project type based on the backend API
export interface Project {
    _id: string;
    name: string;
    description?: string;
    user_id: string;
    created_at: string;
    updated_at: string;
}

interface ProjectContextType {
    projects: Project[];
    selectedProject: Project | null;
    isLoading: boolean;
    fetchProjects: () => Promise<void>;
    createProject: (name: string, description?: string) => Promise<boolean>;
    deleteProject: (projectId: string) => Promise<boolean>;
    selectProject: (projectId: string) => void;
    refreshPapersTrigger: number;
    triggerPapersRefresh: () => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshPapersTrigger, setRefreshPapersTrigger] = useState(0);
    const { user } = useAuth();

    const triggerPapersRefresh = React.useCallback(() => {
        setRefreshPapersTrigger(prev => prev + 1);
    }, []);

    // Helper to get auth token
    const getAuthToken = () => {
        return localStorage.getItem('token');
    };

    const fetchProjects = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const token = getAuthToken();
            if (!token) {
                setIsLoading(false);
                return;
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/projects/`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setProjects(data);

                // Restore saved project or auto-select the first one
                setSelectedProject((currentSelected) => {
                    if (!currentSelected && data.length > 0) {
                        const savedProjectId = localStorage.getItem('selectedProjectId');
                        if (savedProjectId) {
                            const savedProject = data.find((p: Project) => p._id === savedProjectId);
                            return savedProject || data[0];
                        }
                        return data[0];
                    }
                    return currentSelected;
                });
            } else {
                console.error('Failed to fetch projects');
            }
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const createProject = async (name: string, description?: string): Promise<boolean> => {
        try {
            const token = getAuthToken();
            if (!token) {
                toast.error("You must be logged in to create a project");
                return false;
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/projects/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name, description, user_id: user?._id || "temp_id" })
            });

            if (response.ok) {
                const newProject = await response.json();
                // Refetch the full list from DB to ensure it's accurate
                await fetchProjects();
                // Auto-select the new project from fresh state
                setSelectedProject(newProject);
                localStorage.setItem('selectedProjectId', newProject._id);
                toast.success("Project created successfully");
                return true;
            } else {
                const errorData = await response.json();
                const errorMessage = typeof errorData.detail === 'string'
                    ? errorData.detail
                    : JSON.stringify(errorData.detail);
                toast.error(errorMessage || "Failed to create project");
                return false;
            }
        } catch (error) {
            console.error('Error creating project:', error);
            toast.error("An error occurred while creating the project");
            return false;
        }
    };

    const selectProject = (projectId: string) => {
        const project = projects.find(p => p._id === projectId);
        if (project) {
            setSelectedProject(project);
            localStorage.setItem('selectedProjectId', projectId);
        }
    };

    const deleteProject = async (projectId: string): Promise<boolean> => {
        try {
            const token = getAuthToken();
            if (!token) {
                toast.error("You must be logged in to delete a project");
                return false;
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/projects/${projectId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                if (selectedProject?._id === projectId) {
                    const remainingProjects = projects.filter(p => p._id !== projectId);
                    if (remainingProjects.length > 0) {
                        setSelectedProject(remainingProjects[0]);
                        localStorage.setItem('selectedProjectId', remainingProjects[0]._id);
                    } else {
                        setSelectedProject(null);
                        localStorage.removeItem('selectedProjectId');
                    }
                }
                
                await fetchProjects();
                toast.success("Project deleted successfully");
                return true;
            } else {
                toast.error("Failed to delete project");
                return false;
            }
        } catch (error) {
            console.error('Error deleting project:', error);
            toast.error("An error occurred while deleting the project");
            return false;
        }
    };

    // Load projects whenever the logged-in user changes (handles login after initial mount)
    useEffect(() => {
        if (user) {
            fetchProjects();
        } else {
            // User logged out — clear project state
            setProjects([]);
            setSelectedProject(null);
        }
    }, [user, fetchProjects]);

    return (
        <ProjectContext.Provider value={{
            projects,
            selectedProject,
            isLoading,
            fetchProjects,
            createProject,
            deleteProject,
            selectProject,
            refreshPapersTrigger,
            triggerPapersRefresh
        }}>
            {children}
        </ProjectContext.Provider>
    );
}

export function useProject() {
    const context = useContext(ProjectContext);
    if (context === undefined) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
}
