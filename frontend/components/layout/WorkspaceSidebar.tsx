import Link from "next/link";
import {
  FileText,
  Lightbulb,
  StickyNote,
  History,
  Search,
  Home,
  Newspaper,
  Loader2,
  LogIn,
  Plus,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Users,
  MessageSquareWarning,
  LayoutDashboard,
  Columns,
  SearchX,
  Key,
} from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";

interface WorkspaceSidebarProps {
  currentPath: string;
}

const navItems = [
  { path: "/workspace/search", label: "Global Search", icon: Search },
  { path: "/workspace/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/workspace/papers", label: "Papers", icon: FileText },
  { path: "/workspace/collaboration", label: "Collaboration", icon: Users },
  { path: "/workspace/authors", label: "Author Tracker", icon: Users },
  { path: "/workspace/compare", label: "Compare Papers", icon: Columns },
  { path: "/workspace/news", label: "News", icon: Newspaper },
  { path: "/workspace/conferences", label: "Conferences", icon: CalendarDays },
  { path: "/workspace/rebuttal", label: "Rebuttal Helper", icon: MessageSquareWarning },
  { path: "/workspace/notes", label: "Notes & Writing", icon: StickyNote, extraMatch: "/workspace/writing-tools" },
  { path: "/workspace/analysis", label: "Analysis", icon: Lightbulb },
  { path: "/workspace/history", label: "History", icon: History },
];

export function WorkspaceSidebar({ currentPath }: WorkspaceSidebarProps) {
  const { user } = useAuth();
  const { selectedProject, refreshPapersTrigger } = useProject();
  const [projectPapers, setProjectPapers] = useState<any[]>([]);
  const [isLoadingPapers, setIsLoadingPapers] = useState(false);

  const projectId = selectedProject?._id ?? null;

  const { data: allChats = [], isLoading: isLoadingChats } = useQuery({
    queryKey: ['chats', projectId],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      if (!token) return [];
      const url = projectId
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/chats?project_id=${projectId}`
        : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/chats`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch chats');
      return res.json();
    },
    enabled: !!user,
  });

  const recentChats = allChats.slice(0, 5);

  const [isPapersExpanded, setIsPapersExpanded] = useState(true);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);

  // Function to fetch papers
  const fetchProjectPapers = async () => {
    if (!selectedProject) return;
    setIsLoadingPapers(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/projects/${selectedProject._id}/papers`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setProjectPapers(data);
      }
    } catch (error) {
      console.error("Error fetching project papers", error);
    } finally {
      setIsLoadingPapers(false);
    }
  };

  useEffect(() => {
    if (selectedProject) {
      fetchProjectPapers();
    } else {
      setProjectPapers([]);
    }
  }, [selectedProject, refreshPapersTrigger]);

  // Optional: Expose fetchProjectPapers to context or global event to trigger update from Papers page
  // For now, we'll leave it as fetch on mount/change project.

  const isActive = (item: typeof navItems[0]) => {
    if ((item as any).exact) {
      return currentPath === item.path;
    }
    if ((item as any).extraMatch && currentPath.startsWith((item as any).extraMatch)) {
      return true;
    }
    return currentPath.startsWith(item.path);
  };

  return (
    <div className="h-full flex flex-col py-4">
      {/* Logo */}
      <div className="px-4 mb-6">
        <Link href="/" className="flex items-center gap-2 text-foreground">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Lightbulb className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg">ScholarAI</span>
        </Link>
      </div>

      <div className="px-4 mb-4">
        <Link href="/workspace" className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-4 text-sm font-medium transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          New Chat
        </Link>
      </div>

      {/* Navigation */}
      <nav className="px-3 space-y-1 flex-1 overflow-y-auto">
        {navItems.map((item) => (
          <div key={item.path}>
            <div className="flex items-center relative group">
              <Link
                href={item.path}
                className={`${isActive(item) ? "nav-item-active" : "nav-item"} flex-1`}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>

              {item.label === "Papers" && selectedProject && (
                <div
                  role="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsPapersExpanded(!isPapersExpanded); }}
                  className="absolute right-2 p-1 text-muted-foreground hover:bg-secondary rounded-md z-10"
                >
                  {isPapersExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </div>
              )}

              {item.label === "History" && user && (
                <div
                  role="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsHistoryExpanded(!isHistoryExpanded); }}
                  className="absolute right-2 p-1 text-muted-foreground hover:bg-secondary rounded-md z-10"
                >
                  {isHistoryExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </div>
              )}
            </div>

            {/* Render saved papers immediately below the Papers section */}
            {item.label === "Papers" && selectedProject && isPapersExpanded && (
              <div className="pl-9 pr-2 py-1 space-y-1">
                {isLoadingPapers ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {projectPapers.map((paper: any) => (
                      <li key={paper._id || paper.id}>
                        <a
                          href={paper.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                          title={paper.title}
                        >
                          {paper.title}
                        </a>
                      </li>
                    ))}
                    {projectPapers.length === 0 && (
                      <p className="text-[11px] text-muted-foreground/40">No papers saved yet.</p>
                    )}
                  </ul>
                )}
              </div>
            )}

            {/* Render recent chats immediately below the History section */}
            {item.label === "History" && user && isHistoryExpanded && (
              <div className="pl-9 pr-2 py-1 space-y-1">
                {isLoadingChats ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {recentChats.map((chat: any) => (
                      <li key={chat._id || chat.id}>
                        <Link
                          href={`/chat/${chat._id || chat.id}`}
                          className="flex items-center gap-2 truncate text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors group"
                          title={chat.title}
                        >
                          <MessageSquare className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{chat.title || "Untitled Chat"}</span>
                        </Link>
                      </li>
                    ))}
                    {recentChats.length === 0 && (
                      <p className="text-[11px] text-muted-foreground/40">No chats yet.</p>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pt-4 border-t border-sidebar-border mt-auto space-y-1">
        {!user && (
          <Link href="/auth" className="nav-item bg-primary/10 text-primary hover:bg-primary/20 mb-2">
            <LogIn className="w-4 h-4" />
            <span>Sign In</span>
          </Link>
        )}
        {user && (
          <Link
            href="/workspace/api-keys"
            className={currentPath.startsWith("/workspace/api-keys") ? "nav-item-active" : "nav-item"}
          >
            <Key className="w-4 h-4" />
            <span>Manage API Keys</span>
          </Link>
        )}
        <Link href="/" className="nav-item">
          <Home className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
      </div>
    </div>
  );
}