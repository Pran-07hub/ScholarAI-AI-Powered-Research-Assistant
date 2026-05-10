"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FileText,
  StickyNote,
  Highlighter,
  Loader2,
  AlertCircle,
  FolderOpen,
  ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface SearchResult {
  type: "paper" | "note" | "annotation";
  id: string;
  title: string;
  snippet: string;
  authors?: string[];
  quote?: string;
  project_id: string;
  project_name: string;
  created_at: string;
}

const TYPE_META = {
  paper: { label: "Paper", icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10" },
  note: { label: "Note", icon: StickyNote, color: "text-yellow-500", bg: "bg-yellow-500/10" },
  annotation: { label: "Annotation", icon: Highlighter, color: "text-purple-500", bg: "bg-purple-500/10" },
};

const SESSION_KEY = "global_search_state";

export default function SearchPage() {
  const router = useRouter();
  const { selectedProject } = useProject();

  // Restore state from sessionStorage on mount
  const [query, setQuery] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}").query || ""; } catch { return ""; }
  });
  const [results, setResults] = useState<SearchResult[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}").results || []; } catch { return []; }
  });
  const [total, setTotal] = useState<number>(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}").total || 0; } catch { return 0; }
  });
  const [searched, setSearched] = useState<boolean>(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}").searched || false; } catch { return false; }
  });
  const [scopeProject, setScopeProject] = useState<boolean>(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}").scopeProject || false; } catch { return false; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist state to sessionStorage whenever it changes
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ query, results, total, searched, scopeProject }));
    } catch {}
  }, [query, results, total, searched, scopeProject]);

  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (query.trim().length < 2) return;

      setLoading(true);
      setError(null);
      setSearched(true);

      try {
        const token = localStorage.getItem("token");
        const params = new URLSearchParams({ q: query });
        if (scopeProject && selectedProject) {
          params.set("project_id", selectedProject._id);
        }

        const res = await fetch(`${API}/search?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.detail || "Search failed");
        }

        const data = await res.json();
        setResults(data.results || []);
        setTotal(data.total || 0);
      } catch (err: any) {
        setError(err.message || "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [query, scopeProject, selectedProject]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <Search className="w-5 h-5 text-primary" />
          <div>
            <h1 className="font-semibold text-lg">Global Search</h1>
            <p className="text-xs text-muted-foreground">
              Search across papers, notes, and annotations
            </p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search papers, notes, annotations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={loading || query.trim().length < 2}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
          </Button>
        </form>

        {selectedProject && (
          <label className="flex items-center gap-2 mt-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={scopeProject}
              onChange={(e) => setScopeProject(e.target.checked)}
              className="rounded"
            />
            Limit to project: <span className="font-medium text-foreground">{selectedProject.name}</span>
          </label>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {!searched && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Search className="w-12 h-12 opacity-20" />
            <p className="font-medium">Search your research</p>
            <p className="text-sm text-center max-w-sm">
              Find papers by title or abstract, notes by content, and annotations by text — across all your projects.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-32 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm">Searching…</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!loading && searched && !error && (
          <>
            <p className="text-xs text-muted-foreground mb-4">
              {total === 0
                ? "No results found"
                : `${total} result${total !== 1 ? "s" : ""} for "${query}"`}
            </p>

            <div className="space-y-3">
              {results.map((result) => {
                const meta = TYPE_META[result.type];
                const Icon = meta.icon;

                const handleCardClick = () => {
                  if (result.type === "paper") {
                    router.push(`/workspace/papers?selected=${result.id}&q=${encodeURIComponent(result.title)}`);
                  } else if (result.type === "note") {
                    router.push(`/workspace/notes?selected=${result.id}`);
                  } else {
                    router.push(`/workspace/papers`);
                  }
                };

                return (
                  <div
                    key={`${result.type}-${result.id}`}
                    onClick={handleCardClick}
                    className="group rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 p-1.5 rounded-lg ${meta.bg} flex-shrink-0`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant="secondary" className="text-xs font-normal">
                            {meta.label}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <FolderOpen className="w-3 h-3" />
                            {result.project_name}
                          </div>
                        </div>

                        <h3 className="font-medium text-sm mb-1 line-clamp-2">{result.title}</h3>

                        {result.authors && result.authors.length > 0 && (
                          <p className="text-xs text-muted-foreground mb-1">
                            {result.authors.join(", ")}
                          </p>
                        )}

                        {result.snippet && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {result.snippet}
                          </p>
                        )}

                        {result.quote && (
                          <blockquote className="mt-1 pl-2 border-l-2 border-purple-400 text-xs text-muted-foreground italic line-clamp-2">
                            "{result.quote}"
                          </blockquote>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
