"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Compass,
  TrendingUp,
  Star,
  BookOpen,
  Loader2,
  ExternalLink,
  RefreshCw,
  Search,
  Sparkles,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}
function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published_date?: string;
  year?: number;
  url: string;
  pdf_url?: string;
  source: string;
  topic?: string;
  citation_count?: number | null;
}

interface NextStep {
  topic: string;
  reason: string;
  search_query: string;
  sample_papers?: Paper[];
}

interface Recommendations {
  gaps: string[];
  next_steps: NextStep[];
  reasoning: string;
}

function PaperCard({ paper }: { paper: Paper }) {
  const date = paper.published_date || (paper.year ? String(paper.year) : null);
  return (
    <a
      href={paper.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors flex-1">
          {paper.title}
        </h3>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
      </div>
      {paper.authors?.length > 0 && (
        <p className="text-xs text-muted-foreground truncate">
          {paper.authors.slice(0, 3).join(", ")}
          {paper.authors.length > 3 && " et al."}
        </p>
      )}
      {paper.abstract && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {paper.abstract}
        </p>
      )}
      <div className="flex items-center gap-2 mt-auto pt-1">
        {date && <span className="text-[10px] text-muted-foreground">{date}</span>}
        {paper.citation_count != null && (
          <Badge variant="secondary" className="text-[10px] font-normal">
            {paper.citation_count.toLocaleString()} citations
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px] font-normal capitalize">
          {paper.source}
        </Badge>
      </div>
    </a>
  );
}

type Tab = "trending" | "seminal" | "recommendations";

const TOPICS = [
  "machine learning",
  "natural language processing",
  "computer vision",
  "reinforcement learning",
  "deep learning",
  "bioinformatics",
  "robotics",
  "cybersecurity",
];

export default function DiscoveryPage() {
  const { selectedProject } = useProject();
  const [tab, setTab] = useState<Tab>("trending");
  const [topicInput, setTopicInput] = useState("machine learning");

  const [trendingPapers, setTrendingPapers] = useState<Paper[]>([]);
  const [seminalPapers, setSeminalPapers] = useState<Paper[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);

  const [loadingTrending, setLoadingTrending] = useState(false);
  const [loadingSeminal, setLoadingSeminal] = useState(false);
  const [loadingRec, setLoadingRec] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrending = useCallback(async () => {
    setLoadingTrending(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/discovery/trending?topic=${encodeURIComponent(topicInput)}&limit=12`
      );
      const data = await res.json();
      setTrendingPapers(data.papers || []);
    } catch {
      setError("Failed to fetch trending papers");
    } finally {
      setLoadingTrending(false);
    }
  }, [topicInput]);

  const fetchSeminal = useCallback(async () => {
    setLoadingSeminal(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/discovery/seminal?topic=${encodeURIComponent(topicInput)}&limit=12`
      );
      const data = await res.json();
      setSeminalPapers(data.papers || []);
    } catch {
      setError("Failed to fetch seminal papers");
    } finally {
      setLoadingSeminal(false);
    }
  }, [topicInput]);

  const fetchRecommendations = useCallback(async () => {
    if (!selectedProject) {
      toast.info("Select a project to get personalised recommendations");
      return;
    }
    setLoadingRec(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/discovery/recommendations/${selectedProject._id}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setRecommendations(data);
    } catch {
      setError("Failed to generate recommendations");
    } finally {
      setLoadingRec(false);
    }
  }, [selectedProject]);

  // Auto-fetch on tab change
  useEffect(() => {
    if (tab === "trending") fetchTrending();
    else if (tab === "seminal") fetchSeminal();
    else if (tab === "recommendations") fetchRecommendations();
  }, [tab]);

  const handleSearch = () => {
    if (tab === "trending") fetchTrending();
    else if (tab === "seminal") fetchSeminal();
  };

  const loading = tab === "trending" ? loadingTrending : tab === "seminal" ? loadingSeminal : loadingRec;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Compass className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-lg">Discovery</h1>
              <p className="text-xs text-muted-foreground">
                Find trending papers, foundational works, and personalised reading suggestions
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            if (tab === "trending") fetchTrending();
            else if (tab === "seminal") fetchSeminal();
            else fetchRecommendations();
          }} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border -mb-4 pb-0">
          {([
            { id: "trending", label: "Trending", icon: TrendingUp },
            { id: "seminal", label: "Seminal Papers", icon: Star },
            { id: "recommendations", label: "What to Read Next", icon: Sparkles },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
                tab === id
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Search bar for trending/seminal */}
        {(tab === "trending" || tab === "seminal") && (
          <div className="flex items-center gap-2 mb-5">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="e.g. machine learning, NLP, computer vision"
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <Button size="sm" onClick={handleSearch} disabled={loading}>Search</Button>
            <div className="flex flex-wrap gap-1.5 ml-2">
              {TOPICS.slice(0, 4).map((t) => (
                <button
                  key={t}
                  onClick={() => setTopicInput(t)}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-border hover:border-primary/30 hover:bg-muted text-muted-foreground capitalize transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">
              {tab === "recommendations" ? "Analysing your reading list with AI…" : "Fetching papers…"}
            </p>
          </div>
        )}

        {/* Trending / Seminal papers grid */}
        {!loading && (tab === "trending" || tab === "seminal") && (
          <>
            {(tab === "trending" ? trendingPapers : seminalPapers).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
                <BookOpen className="w-12 h-12 opacity-20 mb-3" />
                <p className="font-medium">No papers found</p>
                <p className="text-sm mt-1">Try a different topic.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {(tab === "trending" ? trendingPapers : seminalPapers).map((p, i) => (
                  <PaperCard key={i} paper={p} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Recommendations */}
        {!loading && tab === "recommendations" && (
          <>
            {!selectedProject && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
                <Compass className="w-12 h-12 opacity-20 mb-3" />
                <p className="font-medium">No project selected</p>
                <p className="text-sm mt-1">Select a project to get AI-powered reading recommendations.</p>
              </div>
            )}

            {selectedProject && !recommendations && !loading && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
                <Sparkles className="w-12 h-12 opacity-20 mb-3" />
                <p className="font-medium">Ready to analyse</p>
                <p className="text-sm mt-1 max-w-sm">
                  Click Refresh to get personalised reading suggestions based on your project papers.
                </p>
                <Button className="mt-4" onClick={fetchRecommendations}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Recommendations
                </Button>
              </div>
            )}

            {recommendations && (
              <div className="max-w-3xl space-y-6">
                {/* Reasoning */}
                {recommendations.reasoning && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm text-foreground">
                    <div className="flex items-center gap-2 mb-1 font-medium text-primary">
                      <Sparkles className="w-4 h-4" />
                      AI Analysis
                    </div>
                    {recommendations.reasoning}
                  </div>
                )}

                {/* Gaps */}
                {recommendations.gaps?.length > 0 && (
                  <div>
                    <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-500" />
                      Gaps in Your Reading
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {recommendations.gaps.map((gap, i) => (
                        <span
                          key={i}
                          className="px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-500/10 dark:border-orange-500/30 text-sm text-orange-700 dark:text-orange-400"
                        >
                          {gap}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Next steps */}
                {recommendations.next_steps?.map((step, i) => (
                  <div key={i} className="border border-border rounded-xl p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="p-1.5 rounded-md bg-primary/10 text-primary flex-shrink-0 mt-0.5">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{step.topic}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{step.reason}</p>
                        {step.search_query && (
                          <code className="text-[11px] bg-muted px-2 py-0.5 rounded mt-1 inline-block">
                            Search: {step.search_query}
                          </code>
                        )}
                      </div>
                    </div>
                    {step.sample_papers && step.sample_papers.length > 0 && (
                      <div className="mt-3 space-y-2 pl-10">
                        <p className="text-[11px] text-muted-foreground font-medium mb-1">Sample papers:</p>
                        {step.sample_papers.slice(0, 3).map((p, j) => (
                          <a
                            key={j}
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-2 text-xs text-muted-foreground hover:text-primary transition-colors group"
                          >
                            <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0 group-hover:text-primary" />
                            <span className="line-clamp-1">{p.title}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
