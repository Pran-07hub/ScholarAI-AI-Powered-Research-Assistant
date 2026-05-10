"use client";

import { useState, useEffect, useCallback } from "react";
import {
  SearchX,
  Sparkles,
  Loader2,
  FileText,
  RefreshCw,
  AlertTriangle,
  Compass,
  FlaskConical,
  TrendingUp,
  CheckCircle2,
  Download,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/context/ProjectContext";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface GapAnalysisResult {
  current_state: string;
  limitations: string[];
  underexplored: string[];
  future_directions: string[];
}

interface Paper {
  _id: string;
  title: string;
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

function Section({
  icon: Icon,
  title,
  color,
  items,
  isText,
  text,
}: {
  icon: React.ElementType;
  title: string;
  color: string;
  items?: string[];
  isText?: boolean;
  text?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-md ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {isText ? (
        <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
      ) : (
        <ul className="space-y-2">
          {(items || []).map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      )}
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

export default function GapAnalysis() {
  const { selectedProject } = useProject();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [result, setResult] = useState<GapAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isPapersLoading, setIsPapersLoading] = useState(false);
  const [isExporting, setIsExporting] = useState<"md" | "docx" | null>(null);

  // Reset when project changes
  useEffect(() => {
    setResult(null);
    setHasAnalyzed(false);
    setPapers([]);
  }, [selectedProject]);

  // Load papers for the selected project
  const fetchPapers = useCallback(async () => {
    if (!selectedProject) return;
    setIsPapersLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/projects/${selectedProject._id}/papers`,
        { headers: authHeaders() }
      );
      if (res.ok) {
        const data: Paper[] = await res.json();
        setPapers(data);
      }
    } catch {
      toast.error("Failed to load project papers.");
    } finally {
      setIsPapersLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  const handleAnalyze = async () => {
    if (!selectedProject || papers.length === 0) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(
        `${API_BASE}/projects/${selectedProject._id}/analyze-gaps`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ paper_ids: papers.map((p) => p._id) }),
        }
      );
      if (res.ok) {
        const data: GapAnalysisResult = await res.json();
        setResult(data);
        setHasAnalyzed(true);
        toast.success("Gap analysis complete!");
      } else {
        toast.error("Analysis failed. Please try again.");
      }
    } catch {
      toast.error("Error during gap analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExport = async (format: "md" | "docx") => {
    if (!result || !selectedProject) return;
    const base = selectedProject.name.replace(/\s+/g, "_").slice(0, 40);
    const title = `Research Gap Analysis — ${selectedProject.name}`;
    const lines = [
      `# ${title}`,
      "",
      "## Current State of the Field",
      "",
      result.current_state,
      "",
    ];
    if (result.limitations.length) {
      lines.push("## Key Limitations", "", ...result.limitations.map((l) => `- ${l}`), "");
    }
    if (result.underexplored.length) {
      lines.push("## Underexplored Areas", "", ...result.underexplored.map((u) => `- ${u}`), "");
    }
    if (result.future_directions.length) {
      lines.push("## Future Research Directions", "", ...result.future_directions.map((f) => `- ${f}`), "");
    }
    const md = lines.join("\n");

    if (format === "md") {
      downloadBlob(md, `${base}_gap_analysis.md`, "text/markdown");
      return;
    }

    setIsExporting("docx");
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/projects/export/convert-docx`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title, content_md: md, filename: `${base}_gap_analysis` }),
      });
      if (!res.ok) throw new Error("Export failed");
      const buf = await res.arrayBuffer();
      downloadBlob(new Uint8Array(buf), `${base}_gap_analysis.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
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
            <h1 className="text-xl font-semibold">Research Gap Analysis</h1>
            <p className="text-sm text-muted-foreground">
              AI-identified gaps and future directions in{" "}
              <span className="font-medium text-foreground">{selectedProject.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasAnalyzed && result && (
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
              onClick={handleAnalyze}
              disabled={isAnalyzing || isPapersLoading || papers.length === 0}
            >
              {isAnalyzing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : hasAnalyzed ? (
                <RefreshCw className="w-4 h-4 mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {isAnalyzing ? "Analyzing…" : hasAnalyzed ? "Re-analyze" : "Analyze Gaps"}
            </Button>
          </div>
        </div>
        {hasAnalyzed && (
          <span className="ai-badge">
            <Sparkles className="w-3 h-3" />
            AI Analysis • {papers.length} paper{papers.length !== 1 ? "s" : ""} analyzed
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {/* Empty state */}
          {!hasAnalyzed && !isAnalyzing && papers.length === 0 && !isPapersLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <FileText className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-medium text-lg mb-1">No papers saved yet</p>
              <p className="text-sm max-w-sm">
                Go to the <span className="font-medium text-foreground">Papers</span> section and save papers to this project first.
              </p>
            </div>
          )}

          {/* Ready state */}
          {!hasAnalyzed && !isAnalyzing && papers.length > 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <SearchX className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-medium text-lg mb-1">Ready to analyze</p>
              <p className="text-sm max-w-sm">
                Click <span className="font-medium text-foreground">"Analyze Gaps"</span> to
                identify limitations, unexplored areas, and future research directions across your{" "}
                {papers.length} saved paper{papers.length !== 1 ? "s" : ""}.
              </p>
            </div>
          )}

          {/* Loading skeleton */}
          {isAnalyzing && (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-card border border-border rounded-lg p-5">
                  <div className="h-4 w-1/3 rounded bg-muted animate-pulse mb-3" />
                  <div className="space-y-2">
                    <div className="h-3 w-full rounded bg-muted animate-pulse" />
                    <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-4/6 rounded bg-muted animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {hasAnalyzed && !isAnalyzing && result && (
            <div className="space-y-4">
              <Section
                icon={CheckCircle2}
                title="Current State of the Field"
                color="bg-blue-500/10 text-blue-500"
                isText
                text={result.current_state}
              />
              <Section
                icon={AlertTriangle}
                title="Key Limitations in Existing Research"
                color="bg-orange-500/10 text-orange-500"
                items={result.limitations}
              />
              <Section
                icon={Compass}
                title="Underexplored Research Areas"
                color="bg-purple-500/10 text-purple-500"
                items={result.underexplored}
              />
              <Section
                icon={TrendingUp}
                title="Promising Future Directions"
                color="bg-green-500/10 text-green-500"
                items={result.future_directions}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
