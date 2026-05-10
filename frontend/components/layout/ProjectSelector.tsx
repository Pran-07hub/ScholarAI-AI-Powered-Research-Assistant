"use client";

import { useProject } from "@/context/ProjectContext";
import { useAuth } from "@/context/AuthContext";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CreateProjectModal } from "./CreateProjectModal";
import { Plus, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ProjectSelector() {
    const { user } = useAuth();
    const router = useRouter();
    const { projects, selectedProject, selectProject, isLoading, deleteProject } = useProject();
    const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

    if (!user) return null;

    if (isLoading) {
        return <div className="h-9 w-[200px] animate-pulse bg-muted rounded-md" />;
    }

    return (
        <div className="flex items-center gap-2">
            <Select
                value={selectedProject?._id}
                onValueChange={(value) => {
                    selectProject(value);
                    router.push("/workspace");
                }}
            >
                <SelectTrigger className="w-[320px]">
                    <SelectValue placeholder="Select a project">
                        {selectedProject && (
                            <span className="truncate">
                                {selectedProject.name}
                                {selectedProject.description && (
                                    <span className="text-xs text-muted-foreground ml-1">({selectedProject.description})</span>
                                )}
                            </span>
                        )}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {projects.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground text-center">
                            No projects found
                        </div>
                    ) : (
                        projects.map((project) => (
                            <SelectItem key={project._id} value={project._id} className="w-full">
                                <div className="flex w-[270px] items-center justify-between">
                                    <span className="truncate pr-2">
                                        {project.name}
                                        {project.description && (
                                            <span className="text-xs text-muted-foreground ml-1">({project.description})</span>
                                        )}
                                    </span>
                                    {selectedProject?._id !== project._id && (
                                        <div
                                            role="button"
                                            aria-label="Delete project"
                                            className="cursor-pointer p-1 rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }}
                                            onPointerDown={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }}
                                            onPointerUp={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setProjectToDelete(project._id);
                                            }}
                                        >
                                            <X className="h-4 w-4" />
                                        </div>
                                    )}
                                </div>
                            </SelectItem>
                        ))
                    )}
                    <Separator className="my-1" />
                </SelectContent>
            </Select>
            <CreateProjectModal />

            <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the project
                            and remove all associated data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                if (projectToDelete) {
                                    await deleteProject(projectToDelete);
                                    setProjectToDelete(null);
                                }
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
