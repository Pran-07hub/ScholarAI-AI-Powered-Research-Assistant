"use client";

import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  FileText,
  StickyNote,
  Users,
  Clock,
  Loader2,
  AlertCircle,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface DashboardData {
  project: {
    id: string;
    name: string;
    description?: string;
    created_at: string;
    updated_at: string;
    member_count: number;
  };
  stats: {
    paper_count: number;
    note_count: number;
    annotation_count: number;
    sources: Record<string, number>;
  };
  recent_activity: Array<{
    type: "paper" | "note";
    title: string;
    authors?: string[];
    created_at: string;
    id: string;
  }>;
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  const { selectedProject } = useProject();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProject) {
      setData(null);
      return;
    }

    const fetchDashboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API}/projects/${selectedProject._id}/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.detail || "Failed to load dashboard");
        }
        setData(await res.json());
      } catch (err: any) {
        setError(err.message || "Could not load dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [selectedProject]);

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
        <LayoutDashboard className="w-12 h-12 opacity-20" />
        <p className="font-medium">No project selected</p>
        <p className="text-sm">Select a project from the top bar to view its dashboard.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-sm">Loading dashboard…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm max-w-md">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { project, stats, recent_activity } = data;

  const statCards = [
    { label: "Papers", value: stats.paper_count, icon: FileText, color: "text-blue-500" },
    { label: "Notes", value: stats.note_count, icon: StickyNote, color: "text-yellow-500" },
    { label: "Collaborators", value: project.member_count, icon: Users, color: "text-green-500" },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      {/* Project header */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <LayoutDashboard className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-semibold text-xl">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{project.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Created {new Date(project.created_at).toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            })} · Last updated {timeAgo(project.updated_at)}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
            <div className={`p-2 rounded-lg bg-muted ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sources breakdown + Recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Paper sources */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h2 className="font-medium text-sm">Paper Sources</h2>
          </div>
          {Object.keys(stats.sources).length === 0 ? (
            <p className="text-sm text-muted-foreground">No papers yet.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.sources)
                .sort(([, a], [, b]) => b - a)
                .map(([source, count]) => {
                  const pct = stats.paper_count > 0 ? Math.round((count / stats.paper_count) * 100) : 0;
                  return (
                    <div key={source} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="capitalize text-muted-foreground">{source}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="font-medium text-sm">Recent Activity</h2>
          </div>
          {recent_activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {recent_activity.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`mt-0.5 p-1 rounded ${item.type === "paper" ? "bg-blue-500/10" : "bg-yellow-500/10"}`}>
                    {item.type === "paper" ? (
                      <BookOpen className="w-3 h-3 text-blue-500" />
                    ) : (
                      <StickyNote className="w-3 h-3 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    {item.authors && item.authors.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {item.authors.join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {timeAgo(item.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
