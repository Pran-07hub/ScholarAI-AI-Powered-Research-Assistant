"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  RefreshCw,
  FileSearch,
  Download,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface TopicResult {
  topic: string;
  summary: string;
  paper_ids: string[];
}

interface PaperMeta {
  id: string;
  title: string;
  authors: string[];
  publication_date?: string | null;
}

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
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

export default function Synthesis() {
  const { selectedProject } = useProject();
  const [topics, setTopics] = useState<TopicResult[]>([]);
  const [papersMeta, setPapersMeta] = useState<PaperMeta[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set([0]));
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [hasSynthesized, setHasSynthesized] = useState(false);
  const [isExporting, setIsExporting] = useState<"md" | "docx" | null>(null);

  // Reset state when project changes
  useEffect(() => {
    setTopics([]);
    setPapersMeta([]);
    setHasSynthesized(false);
    setExpandedTopics(new Set([0]));
  }, [selectedProject]);

  const handleSynthesize = useCallback(async () => {
    if (!selectedProject) return;
    setIsSynthesizing(true);
    try {
      const res = await fetch(
        `${API_BASE}/projects/${selectedProject._id}/synthesize`,
        { method: "POST", headers: authHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setTopics(data.topics || []);
        setPapersMeta(data.papers || []);
        setHasSynthesized(true);
        if (data.topics?.length > 0) {
          setExpandedTopics(new Set([0]));
        }
        toast.success("Synthesis complete!");
      } else {
        toast.error("Synthesis failed.");
      }
    } catch {
      toast.error("Error during synthesis.");
    } finally {
      setIsSynthesizing(false);
    }
  }, [selectedProject]);

  const toggleExpand = (idx: number) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const getPaper = (id: string) => papersMeta.find((p) => p.id === id);

  const handleExport = async (format: "md" | "docx") => {
    if (!hasSynthesized || topics.length === 0 || !selectedProject) return;
    const base = selectedProject.name.replace(/\s+/g, "_").slice(0, 40);
    const title = `Topic Synthesis — ${selectedProject.name}`;
    const lines = [`# ${title}`, ""];
    for (const t of topics) {
      lines.push(`## ${t.topic}`, "", t.summary, "");
      if (t.paper_ids.length > 0) {
        lines.push("**Papers:**");
        for (const pid of t.paper_ids) {
          const p = getPaper(pid);
          if (p) {
            const year = p.publication_date ? new Date(p.publication_date).getFullYear() : "n.d.";
            const authors =
              p.authors.length > 2
                ? `${p.authors.slice(0, 2).join(", ")} et al.`
                : p.authors.join(", ");
            lines.push(`- ${p.title} (${authors}, ${year})`);
          }
        }
        lines.push("");
      }
    }
    const md = lines.join("\n");

    if (format === "md") {
      downloadBlob(md, `${base}_synthesis.md`, "text/markdown");
      return;
    }

    setIsExporting("docx");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/projects/export/convert-docx`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title, content_md: md, filename: `${base}_synthesis` }),
      });
      if (!res.ok) throw new Error("Export failed");
      const buf = await res.arrayBuffer();
      downloadBlob(new Uint8Array(buf), `${base}_synthesis.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    } catch {
      toast.error("Export failed");
    } finally {
      setIsExporting(null);
    }
  };

  // ── No project selected ──────────────────────────────────────────────────
  if (!selectedProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No project selected</p>
          <p className="text-sm mt-1">Select a project from the top bar to begin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-semibold">Evidence Synthesis</h1>
            <p className="text-sm text-muted-foreground">
              AI-identified topics across papers in{" "}
              <span className="font-medium text-foreground">{selectedProject.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasSynthesized && topics.length > 0 && (
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
              variant="default"
              size="sm"
              onClick={handleSynthesize}
              disabled={isSynthesizing}
            >
              {isSynthesizing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : hasSynthesized ? (
                <RefreshCw className="w-4 h-4 mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {isSynthesizing
                ? "Analyzing…"
                : hasSynthesized
                ? "Re-analyze"
                : "Analyze Topics"}
            </Button>
          </div>
        </div>
        {hasSynthesized && (
          <div className="flex items-center gap-2">
            <span className="ai-badge">
              <Sparkles className="w-3 h-3" />
              AI Synthesized • {topics.length} topic{topics.length !== 1 ? "s" : ""} • {papersMeta.length} paper{papersMeta.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {/* Initial state — not yet synthesized */}
          {!hasSynthesized && !isSynthesizing && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <FileSearch className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-medium text-lg mb-1">Ready to analyze</p>
              <p className="text-sm max-w-sm">
                Click <span className="font-medium text-foreground">"Analyze Topics"</span> above
                to have AI identify the main topics discussed across your saved papers.
              </p>
            </div>
          )}

          {/* Loading state */}
          {isSynthesizing && (
            <div className="space-y-3 py-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-card border border-border rounded-lg p-4">
                  <div className="h-5 w-2/3 rounded bg-muted animate-pulse mb-2" />
                  <div className="h-4 w-full rounded bg-muted animate-pulse mb-1" />
                  <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {/* Empty result */}
          {hasSynthesized && !isSynthesizing && topics.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">No topics found</p>
              <p className="text-sm mt-1">
                Save more papers to this project first, then re-analyze.
              </p>
            </div>
          )}

          {/* Topics list */}
          {hasSynthesized && !isSynthesizing && topics.length > 0 && (
            <div className="space-y-3">
              {topics.map((topic, idx) => {
                const isExpanded = expandedTopics.has(idx);
                return (
                  <div
                    key={idx}
                    className="bg-card border border-border rounded-lg overflow-hidden"
                  >
                    {/* Topic header — click to expand */}
                    <button
                      className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-secondary/30 transition-colors"
                      onClick={() => toggleExpand(idx)}
                    >
                      <span className="text-sm font-medium text-muted-foreground mt-0.5">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm leading-snug">{topic.topic}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                          {topic.summary}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {topic.paper_ids.length} paper{topic.paper_ids.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
                      )}
                    </button>

                    {/* Expanded — list papers */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 border-t border-border">
                        <div className="pl-6 pt-3">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
                            Papers discussing this topic
                          </label>
                          <div className="space-y-2">
                            {topic.paper_ids.map((pid) => {
                              const paper = getPaper(pid);
                              if (!paper) return null;
                              const year = paper.publication_date
                                ? new Date(paper.publication_date).getFullYear()
                                : null;
                              return (
                                <div
                                  key={pid}
                                  className="flex items-center gap-2 text-sm bg-secondary/50 rounded px-3 py-2"
                                >
                                  <span className="flex-1 line-clamp-1">
                                    {paper.authors.length > 0
                                      ? `${paper.authors[0]}${paper.authors.length > 1 ? " et al." : ""}`
                                      : "Unknown"}
                                    {year ? ` (${year})` : ""} —{" "}
                                    <span className="text-muted-foreground">{paper.title}</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}