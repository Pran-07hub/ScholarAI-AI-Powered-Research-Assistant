"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Users,
  Search,
  UserPlus,
  UserCheck,
  ExternalLink,
  Loader2,
  AlertCircle,
  BookOpen,
  RefreshCw,
  X,
  Quote,
  FileText,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}
function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };
}

// ── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-indigo-500",
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function AuthorAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "w-10 h-10 text-sm" : size === "sm" ? "w-7 h-7 text-[10px]" : "w-8 h-8 text-xs";
  return (
    <div className={`${sz} ${avatarColor(name)} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 select-none`}>
      {initials(name)}
    </div>
  );
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Author {
  id: string;
  name: string;
  affiliations: string[];
  paper_count: number | null;
  citation_count: number | null;
  h_index: number | null;
}

interface TrackedAuthor {
  id: string;
  author_name: string;
  semantic_scholar_id: string | null;
  affiliation: string | null;
  h_index: number | null;
  paper_count: number | null;
  citation_count: number | null;
}

interface Paper {
  id: string;
  title: string;
  year: number | null;
  abstract: string;
  citation_count: number | null;
  url: string;
  pdf_url: string;
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number | null | undefined }) {
  if (value == null) return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-medium">
      {icon}
      <span className="text-foreground/70">{label}</span>
      <span className="font-semibold text-foreground">{typeof value === "number" ? fmtNum(value) : value}</span>
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuthorsPage() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Author[]>([]);
  const [searching, setSearching] = useState(false);
  const [tracked, setTracked] = useState<TrackedAuthor[]>([]);
  const [selectedAuthor, setSelectedAuthor] = useState<TrackedAuthor | null>(null);
  const [authorPapers, setAuthorPapers] = useState<Paper[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTracked = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/authors/tracked`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTracked(data.authors || []);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => { loadTracked(); }, [loadTracked]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/authors/search?query=${encodeURIComponent(query)}&limit=15`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data.authors || []);
    } catch {
      setError("Could not search authors. Semantic Scholar may be unavailable.");
    } finally {
      setSearching(false);
    }
  };

  const handleTrack = async (author: Author) => {
    const token = getToken();
    if (!token) return toast.error("Sign in to track authors");
    try {
      const res = await fetch(`${API_BASE}/authors/track`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          author_name: author.name,
          semantic_scholar_id: author.id,
          affiliation: author.affiliations?.[0] || null,
          h_index: author.h_index,
          paper_count: author.paper_count,
          citation_count: author.citation_count,
        }),
      });
      if (!res.ok) throw new Error("Track failed");
      const data = await res.json();
      setTracked((prev) => [
        ...prev,
        {
          id: data.id,
          author_name: author.name,
          semantic_scholar_id: author.id,
          affiliation: author.affiliations?.[0] || null,
          h_index: author.h_index,
          paper_count: author.paper_count,
          citation_count: author.citation_count,
        },
      ]);
      toast.success(`Now tracking ${author.name}`);
    } catch {
      toast.error("Could not track author");
    }
  };

  const handleUntrack = async (trackedId: string) => {
    try {
      await fetch(`${API_BASE}/authors/track/${trackedId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setTracked((prev) => prev.filter((a) => a.id !== trackedId));
      if (selectedAuthor?.id === trackedId) setSelectedAuthor(null);
      toast.success("Untracked");
    } catch {
      toast.error("Could not untrack");
    }
  };

  const loadAuthorPapers = async (author: TrackedAuthor) => {
    if (!author.semantic_scholar_id) return;
    setSelectedAuthor(author);
    setLoadingPapers(true);
    setAuthorPapers([]);
    try {
      const res = await fetch(`${API_BASE}/authors/${author.semantic_scholar_id}/papers?limit=15`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setAuthorPapers(data.papers || []);
    } catch {
      toast.error("Could not load author's papers");
    } finally {
      setLoadingPapers(false);
    }
  };

  const trackedIds = new Set(tracked.map((a) => a.semantic_scholar_id).filter(Boolean));

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-border flex flex-col bg-card/40">

        {/* Header + search */}
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h1 className="font-semibold text-sm">Author Tracker</h1>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search researchers…"
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <Button size="sm" onClick={handleSearch} disabled={searching} className="px-2.5">
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mx-3 mt-2 flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* Search results */}
          {searchResults.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Search results
                </span>
                <span className="text-[10px] text-muted-foreground">({searchResults.length})</span>
              </div>
              <div className="space-y-px px-2">
                {searchResults.map((a) => {
                  const isTracked = trackedIds.has(a.id);
                  const trackedEntry = tracked.find((t) => t.semantic_scholar_id === a.id);
                  return (
                    <div
                      key={a.id}
                      className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                    >
                      <AuthorAvatar name={a.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight truncate">{a.name}</p>
                        {a.affiliations.length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-tight">
                            {a.affiliations.join(" · ")}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <StatChip icon={<BarChart2 className="w-2.5 h-2.5" />} label="h" value={a.h_index} />
                          <StatChip icon={<FileText className="w-2.5 h-2.5" />} label="papers" value={a.paper_count} />
                          <StatChip icon={<Quote className="w-2.5 h-2.5" />} label="cit." value={a.citation_count} />
                        </div>
                      </div>
                      <button
                        className={`mt-0.5 p-1 rounded-md transition-colors flex-shrink-0 ${
                          isTracked
                            ? "text-primary bg-primary/10 hover:bg-primary/20"
                            : "text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100"
                        }`}
                        onClick={() =>
                          isTracked && trackedEntry ? handleUntrack(trackedEntry.id) : handleTrack(a)
                        }
                        title={isTracked ? "Untrack" : "Track author"}
                      >
                        {isTracked ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Divider between sections */}
          {searchResults.length > 0 && tracked.length > 0 && (
            <div className="mx-4 my-2 border-t border-border" />
          )}

          {/* Tracked authors */}
          {tracked.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Tracked
                </span>
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/15 text-primary text-[9px] font-bold">
                  {tracked.length}
                </span>
              </div>
              <div className="space-y-px px-2 pb-3">
                {tracked.map((a) => {
                  const isSelected = selectedAuthor?.id === a.id;
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group ${
                        isSelected
                          ? "bg-primary/10 ring-1 ring-primary/20"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => loadAuthorPapers(a)}
                    >
                      <AuthorAvatar name={a.author_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-tight truncate ${isSelected ? "text-primary" : ""}`}>
                          {a.author_name}
                        </p>
                        {a.affiliation && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{a.affiliation}</p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1">
                          <StatChip icon={<BarChart2 className="w-2.5 h-2.5" />} label="h" value={a.h_index} />
                          <StatChip icon={<FileText className="w-2.5 h-2.5" />} label="papers" value={a.paper_count} />
                          <StatChip icon={<Quote className="w-2.5 h-2.5" />} label="cit." value={a.citation_count} />
                        </div>
                      </div>
                      <button
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded-md hover:bg-destructive/10 flex-shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); handleUntrack(a.id); }}
                        title="Untrack"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tracked.length === 0 && searchResults.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-center text-muted-foreground p-8 pt-16">
              <div>
                <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No tracked authors yet</p>
                <p className="text-xs mt-1 text-muted-foreground/70">Search for researchers above to start tracking them</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedAuthor ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-center">
            <div>
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Select an author</p>
              <p className="text-sm mt-1 text-muted-foreground/70">
                Track researchers and view their latest publications
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Author header */}
            <div className="px-6 py-4 border-b border-border bg-card flex-shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AuthorAvatar name={selectedAuthor.author_name} size="lg" />
                  <div>
                    <h2 className="font-semibold text-base leading-tight">{selectedAuthor.author_name}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedAuthor.affiliation || "Affiliation unknown"}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <StatChip icon={<BarChart2 className="w-2.5 h-2.5" />} label="h-index" value={selectedAuthor.h_index} />
                      <StatChip icon={<FileText className="w-2.5 h-2.5" />} label="papers" value={selectedAuthor.paper_count} />
                      <StatChip icon={<Quote className="w-2.5 h-2.5" />} label="citations" value={selectedAuthor.citation_count} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {selectedAuthor.semantic_scholar_id && (
                    <a
                      href={`https://www.semanticscholar.org/author/${selectedAuthor.semantic_scholar_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary px-2 py-1 rounded-md hover:bg-primary/10 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Profile
                    </a>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => loadAuthorPapers(selectedAuthor)}
                    disabled={loadingPapers}
                    title="Refresh papers"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingPapers ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            </div>

            {/* Papers */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingPapers && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  Loading papers…
                </div>
              )}

              {!loadingPapers && authorPapers.length === 0 && (
                <div className="py-16 text-center text-muted-foreground">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No papers found for this author</p>
                </div>
              )}

              {!loadingPapers && authorPapers.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs text-muted-foreground mb-3">
                    {authorPapers.length} most recent publication{authorPapers.length !== 1 ? "s" : ""}
                  </p>
                  {authorPapers.map((p, i) => (
                    <a
                      key={i}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex flex-col gap-2 bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-medium leading-snug group-hover:text-primary transition-colors line-clamp-2 flex-1">
                          {p.title}
                        </h3>
                        <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {p.abstract && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {p.abstract}
                        </p>
                      )}
                      <div className="flex items-center gap-2 pt-0.5">
                        {p.year && (
                          <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                            {p.year}
                          </Badge>
                        )}
                        {p.citation_count != null && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Quote className="w-2.5 h-2.5" />
                            {p.citation_count.toLocaleString()} citations
                          </span>
                        )}
                        {p.pdf_url && (
                          <span className="ml-auto text-[10px] text-primary/70 group-hover:text-primary transition-colors">
                            PDF available
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
