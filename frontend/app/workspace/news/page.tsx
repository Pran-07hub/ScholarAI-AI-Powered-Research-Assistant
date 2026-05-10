"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Newspaper,
  RefreshCw,
  ExternalLink,
  Loader2,
  AlertCircle,
  Clock,
  Search,
  BookmarkPlus,
  Check,
  Filter,
  X,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useProject } from "@/context/ProjectContext";

interface NewsArticle {
  title: string;
  link: string;
  published: string;
  source: string;
  summary?: string;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function NewsPage() {
  const { selectedProject } = useProject();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [activeKeywords, setActiveKeywords] = useState("");
  const [savedArticles, setSavedArticles] = useState<Set<string>>(new Set());
  const [savingArticle, setSavingArticle] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");

  const fetchNews = useCallback(async (keywords?: string) => {
    setLoading(true);
    setError(null);

    const token = localStorage.getItem("token");

    try {
      let url: string;

      if (keywords && keywords.trim()) {
        // Custom keyword search — no project required
        url = `${API}/news/search?keywords=${encodeURIComponent(keywords)}&limit=12`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Failed to fetch news");
        }
        const data = await res.json();
        setArticles(data.articles || []);
      } else if (selectedProject) {
        // Project-contextual news
        url = `${API}/news/project/${selectedProject._id}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Failed to fetch news");
        }
        const data = await res.json();
        setArticles(data.articles || []);
      } else {
        setArticles([]);
        setLoading(false);
        return;
      }

      setLastFetched(new Date());
    } catch (err: any) {
      setError(err.message || "Could not load news");
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (!activeKeywords) {
      fetchNews();
    }
  }, [fetchNews, activeKeywords]);

  // Reset filters whenever article list changes
  useEffect(() => {
    setSourceFilter(null);
    setDateFilter("all");
  }, [articles]);

  const uniqueSources = Array.from(new Set(articles.map((a) => a.source))).sort();

  const activeFilterCount = (sourceFilter ? 1 : 0) + (dateFilter !== "all" ? 1 : 0);

  const filteredArticles = articles.filter((a) => {
    if (sourceFilter && a.source !== sourceFilter) return false;
    if (dateFilter !== "all") {
      const pub = new Date(a.published);
      const now = new Date();
      if (dateFilter === "today") {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (pub < today) return false;
      } else if (dateFilter === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 86400000);
        if (pub < weekAgo) return false;
      } else if (dateFilter === "month") {
        const monthAgo = new Date(now.getTime() - 30 * 86400000);
        if (pub < monthAgo) return false;
      }
    }
    return true;
  });

  const handleKeywordSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const kw = keywordInput.trim();
    setActiveKeywords(kw);
    fetchNews(kw);
  };

  const handleClearKeywords = () => {
    setKeywordInput("");
    setActiveKeywords("");
    fetchNews("");
  };

  const handleSaveToNotes = async (article: NewsArticle) => {
    if (!selectedProject) return;
    const token = localStorage.getItem("token");
    const key = article.link;
    setSavingArticle(key);

    try {
      const res = await fetch(`${API}/news/save-to-notes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: article.title,
          link: article.link,
          summary: article.summary,
          source: article.source,
          project_id: selectedProject._id,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to save");
      }

      setSavedArticles((prev) => new Set([...prev, key]));
    } catch (err: any) {
      alert(err.message || "Could not save article");
    } finally {
      setSavingArticle(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Newspaper className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-lg">Research News</h1>
              <p className="text-xs text-muted-foreground">
                {activeKeywords
                  ? `Showing results for "${activeKeywords}"`
                  : selectedProject
                  ? `Latest news relevant to "${selectedProject.name}"`
                  : "Search by keywords or select a project"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastFetched && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Updated {lastFetched.toLocaleTimeString()}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNews(activeKeywords || undefined)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {/* Keyword search bar + Filter */}
        <form onSubmit={handleKeywordSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by keywords (e.g. transformer models, CRISPR)…"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" size="sm" disabled={loading || !keywordInput.trim()}>
            Search
          </Button>
          {activeKeywords && (
            <Button variant="ghost" size="sm" onClick={handleClearKeywords}>
              Clear
            </Button>
          )}
          <Button
            type="button"
            variant={activeFilterCount > 0 ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-1.5" />
            Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </Button>
        </form>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-3 border border-border rounded-lg bg-background p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Filter Articles</span>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setSourceFilter(null); setDateFilter("all"); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear all
                </button>
              )}
            </div>

            {/* Date range */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                Date Range
              </label>
              <div className="flex flex-wrap gap-2">
                {(["all", "today", "week", "month"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDateFilter(d)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors capitalize ${
                      dateFilter === d
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    {d === "all" ? "All time" : d === "today" ? "Today" : d === "week" ? "This week" : "This month"}
                  </button>
                ))}
              </div>
            </div>

            {/* Source filter */}
            {uniqueSources.length > 1 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                  Source
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSourceFilter(null)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      sourceFilter === null
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    All ({articles.length})
                  </button>
                  {uniqueSources.map((src) => (
                    <button
                      key={src}
                      onClick={() => setSourceFilter(src === sourceFilter ? null : src)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        sourceFilter === src
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      {src} ({articles.filter((a) => a.source === src).length})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground pt-1">
              Showing {filteredArticles.length} of {articles.length} articles
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* No project and no keyword */}
        {!selectedProject && !activeKeywords && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
            <Newspaper className="w-12 h-12 opacity-20" />
            <p className="font-medium">No project selected</p>
            <p className="text-sm">
              Select a project to see relevant news, or search by keywords above.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && articles.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Fetching news…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Active filter summary */}
        {!loading && !error && activeFilterCount > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {sourceFilter && (
              <span className="flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 text-primary rounded-full border border-primary/20">
                Source: {sourceFilter}
                <button onClick={() => setSourceFilter(null)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
              </span>
            )}
            {dateFilter !== "all" && (
              <span className="flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 text-primary rounded-full border border-primary/20">
                {dateFilter === "today" ? "Today" : dateFilter === "week" ? "This week" : "This month"}
                <button onClick={() => setDateFilter("all")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
              </span>
            )}
            <span className="text-xs text-muted-foreground">— {filteredArticles.length} of {articles.length} articles</span>
          </div>
        )}

        {/* Articles grid */}
        {!loading && !error && filteredArticles.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredArticles.map((article, i) => {
              const isSaved = savedArticles.has(article.link);
              const isSaving = savingArticle === article.link;
              return (
                <div
                  key={i}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
                >
                  {/* Source badge + date */}
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="font-normal text-xs">
                      {article.source}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(article.published)}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-medium text-sm leading-snug line-clamp-3">
                    {article.title}
                  </h3>

                  {/* Summary */}
                  {article.summary && (
                    <p
                      className="text-xs text-muted-foreground line-clamp-3"
                      dangerouslySetInnerHTML={{
                        __html: article.summary.replace(/<[^>]+>/g, ""),
                      }}
                    />
                  )}

                  {/* Actions */}
                  <div className="mt-auto pt-2 border-t border-border flex items-center justify-between">
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Read article
                    </a>

                    {selectedProject && (
                      <button
                        onClick={() => handleSaveToNotes(article)}
                        disabled={isSaving || isSaved}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                        title={isSaved ? "Saved to notes" : "Save to notes"}
                      >
                        {isSaving ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isSaved ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <BookmarkPlus className="w-3 h-3" />
                        )}
                        {isSaved ? "Saved" : "Save to Notes"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredArticles.length === 0 && (selectedProject || activeKeywords) && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
            <Newspaper className="w-12 h-12 opacity-20" />
            <p className="font-medium">No news found</p>
            <p className="text-sm">
              {activeKeywords
                ? "Try different keywords."
                : "Try adding more papers to your project or search by keywords."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
