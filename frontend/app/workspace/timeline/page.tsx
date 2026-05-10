"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Download,
  FileDown,
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

interface TimelinePaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  pdf_url: string;
}

interface TimelineEra {
  year: number | string;
  paper_count: number;
  papers: TimelinePaper[];
  synthesis: string;
}

function EraCard({ era }: { era: TimelineEra }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex gap-6">
      {/* Year marker */}
      <div className="flex flex-col items-center flex-shrink-0 w-16">
        <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
          <span className="text-sm font-bold text-primary">{era.year}</span>
        </div>
        <div className="flex-1 w-0.5 bg-border mt-2" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-8">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {era.paper_count} paper{era.paper_count !== 1 ? "s" : ""}
              </Badge>
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {expanded ? "Hide" : "Show"} papers
            </button>
          </div>

          {/* AI synthesis */}
          {era.synthesis ? (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 text-xs text-primary mb-1.5">
                <Sparkles className="w-3 h-3" />
                <span className="font-medium">AI Synthesis</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{era.synthesis}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No synthesis available.</p>
          )}

          {/* Papers list (collapsible) */}
          {expanded && era.papers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border space-y-3">
              {era.papers.map((paper, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <a
                    href={paper.pdf_url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-sm font-medium leading-snug hover:text-primary transition-colors ${paper.pdf_url ? "cursor-pointer" : "cursor-default"}`}
                  >
                    {paper.title}
                  </a>
                  {paper.authors?.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {paper.authors.slice(0, 3).join(", ")}
                      {paper.authors.length > 3 && " et al."}
                    </p>
                  )}
                  {paper.abstract && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {paper.abstract}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function downloadBlob(content: string | Uint8Array, filename: string, type: string) {
  const blob = new Blob([content as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TimelinePage() {
  const { selectedProject } = useProject();
  const [timeline, setTimeline] = useState<TimelineEra[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<"md" | "docx" | null>(null);

  useEffect(() => {
    setTimeline([]);
    setHasLoaded(false);
    setError(null);
  }, [selectedProject]);

  const fetchTimeline = useCallback(async () => {
    if (!selectedProject) {
      toast.info("Select a project first");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/projects/${selectedProject._id}/timeline`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Failed to fetch timeline");
      const data = await res.json();
      setTimeline(data.timeline || []);
      setHasLoaded(true);
    } catch {
      setError("Could not build timeline. Make sure your project has papers with publication dates.");
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  const handleExport = async (format: "md" | "docx") => {
    if (!hasLoaded || timeline.length === 0 || !selectedProject) return;
    const base = selectedProject.name.replace(/\s+/g, "_").slice(0, 40);
    const title = `Research Timeline — ${selectedProject.name}`;
    const lines = [`# ${title}`, ""];
    for (const era of timeline) {
      lines.push(`## ${era.year}`, "");
      if (era.synthesis) lines.push(era.synthesis, "");
      for (const p of era.papers) {
        let entry = `- **${p.title}**`;
        if (p.authors?.length) entry += ` — ${p.authors.slice(0, 2).join(", ")}${p.authors.length > 2 ? " et al." : ""}`;
        lines.push(entry);
      }
      lines.push("");
    }
    const md = lines.join("\n");

    if (format === "md") {
      downloadBlob(md, `${base}_timeline.md`, "text/markdown");
      return;
    }

    setIsExporting("docx");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE}/projects/export/convert-docx`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title, content_md: md, filename: `${base}_timeline` }),
      });
      if (!res.ok) throw new Error("Export failed");
      const buf = await res.arrayBuffer();
      downloadBlob(new Uint8Array(buf), `${base}_timeline.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    } catch {
      toast.error("Export failed");
    } finally {
      setIsExporting(null);
    }
  };

  if (!selectedProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No project selected</p>
          <p className="text-sm mt-1">Select a project to view its research timeline.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-lg">Research Timeline</h1>
              <p className="text-xs text-muted-foreground">
                How <span className="font-medium text-foreground">{selectedProject.name}</span> evolved year by year
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasLoaded && timeline.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport("md")}
                  disabled={!!isExporting}
                  title="Download Markdown"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  .md
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport("docx")}
                  disabled={!!isExporting}
                  title="Download Word document"
                >
                  {isExporting === "docx" ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4 mr-1.5" />
                  )}
                  .docx
                </Button>
              </>
            )}
            <Button
              variant={hasLoaded ? "outline" : "default"}
              size="sm"
              onClick={fetchTimeline}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : hasLoaded ? (
                <RefreshCw className="w-4 h-4 mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {loading ? "Building…" : hasLoaded ? "Rebuild" : "Build Timeline"}
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm mb-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="max-w-2xl space-y-6">
            {[2024, 2023, 2022].map((yr) => (
              <div key={yr} className="flex gap-6">
                <div className="flex flex-col items-center flex-shrink-0 w-16">
                  <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 w-0.5 bg-border mt-2" />
                </div>
                <div className="flex-1 pb-8">
                  <div className="bg-card border border-border rounded-xl p-5 space-y-2">
                    <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-full rounded bg-muted animate-pulse" />
                    <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !hasLoaded && (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <Clock className="w-16 h-16 mb-4 opacity-20" />
            <p className="font-medium text-lg mb-1">Timeline not built yet</p>
            <p className="text-sm max-w-sm">
              Click <span className="font-medium text-foreground">"Build Timeline"</span> to generate a
              year-by-year view of how the field evolved through your project's papers.
            </p>
          </div>
        )}

        {/* Empty result */}
        {!loading && hasLoaded && timeline.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <FileText className="w-16 h-16 mb-4 opacity-20" />
            <p className="font-medium text-lg mb-1">No dated papers</p>
            <p className="text-sm max-w-sm">
              Your papers don't have publication dates yet. Try adding papers with known publication years.
            </p>
          </div>
        )}

        {/* Timeline */}
        {!loading && timeline.length > 0 && (
          <div className="max-w-2xl">
            <p className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-primary" />
              AI-synthesised summaries · {timeline.reduce((s, e) => s + e.paper_count, 0)} total papers · {timeline.length} time periods
            </p>
            {timeline.map((era, i) => (
              <EraCard key={i} era={era} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
