"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  PenLine,
  Zap,
  Download,
  Loader2,
  AlertCircle,
  FileText,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
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
  return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };
}

type Tab = "related-work" | "contradictions" | "export";

interface Contradiction {
  paper_a_index: number;
  paper_b_index: number;
  paper_a_title: string;
  paper_b_title: string;
  topic: string;
  claim_a: string;
  claim_b: string;
  severity: "major" | "minor";
}

interface ContradictionResult {
  contradictions: Contradiction[];
  summary: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export default function WritingToolsPage() {
  const { selectedProject } = useProject();
  const [tab, setTab] = useState<Tab>("related-work");

  // Related work state
  const [relatedWork, setRelatedWork] = useState("");
  const [loadingRelatedWork, setLoadingRelatedWork] = useState(false);

  // Contradictions state
  const [contradictions, setContradictions] = useState<ContradictionResult | null>(null);
  const [loadingContradictions, setLoadingContradictions] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Reset on project change
  useEffect(() => {
    setRelatedWork("");
    setContradictions(null);
    setError(null);
  }, [selectedProject]);

  const generateRelatedWork = async () => {
    if (!selectedProject) return toast.info("Select a project first");
    setLoadingRelatedWork(true);
    setRelatedWork("");
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/writing-tools/related-work/${selectedProject._id}`,
        { method: "POST", headers: authHeaders() }
      );
      if (!res.ok || !res.body) throw new Error("Failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setRelatedWork((prev) => prev + decoder.decode(value));
      }
    } catch {
      setError("Could not generate related work section.");
    } finally {
      setLoadingRelatedWork(false);
    }
  };

  const detectContradictions = async () => {
    if (!selectedProject) return toast.info("Select a project first");
    setLoadingContradictions(true);
    setContradictions(null);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/writing-tools/contradictions/${selectedProject._id}`,
        { method: "POST", headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setContradictions(data);
    } catch {
      setError("Could not analyse contradictions.");
    } finally {
      setLoadingContradictions(false);
    }
  };

  const downloadFile = (url: string, filename: string) => {
    const token = getToken();
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast.error("Download failed"));
  };

  if (!selectedProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <PenLine className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No project selected</p>
          <p className="text-sm mt-1">Select a project to use writing tools.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <PenLine className="w-5 h-5 text-primary" />
          <div>
            <h1 className="font-semibold text-lg">Writing Tools</h1>
            <p className="text-xs text-muted-foreground">
              AI-powered writing helpers for{" "}
              <span className="font-medium text-foreground">{selectedProject.name}</span>
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border -mb-4">
          {([
            { id: "related-work", label: "Related Work", icon: PenLine },
            { id: "contradictions", label: "Contradiction Detector", icon: Zap },
            { id: "export", label: "Export", icon: Download },
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
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm mb-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Related Work ─────────────────────────────────────────────── */}
        {tab === "related-work" && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold">Related Work Generator</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  AI drafts a related work section from your project papers
                </p>
              </div>
              <div className="flex gap-2">
                {relatedWork && <CopyButton text={relatedWork} />}
                <Button
                  onClick={generateRelatedWork}
                  disabled={loadingRelatedWork}
                  size="sm"
                >
                  {loadingRelatedWork ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : relatedWork ? (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {loadingRelatedWork ? "Generating…" : relatedWork ? "Regenerate" : "Generate"}
                </Button>
              </div>
            </div>

            {!relatedWork && !loadingRelatedWork && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center border border-dashed border-border rounded-xl">
                <PenLine className="w-12 h-12 opacity-20 mb-3" />
                <p className="font-medium">Ready to generate</p>
                <p className="text-sm mt-1 max-w-sm">
                  Click <span className="font-medium text-foreground">Generate</span> to draft a related work
                  section from your {selectedProject.name} papers.
                </p>
              </div>
            )}

            {loadingRelatedWork && relatedWork === "" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Streaming from AI…
              </div>
            )}

            {relatedWork && (
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-1.5 text-xs text-primary mb-3">
                  <Sparkles className="w-3 h-3" />
                  <span className="font-medium">AI-Generated Related Work Section</span>
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap font-serif text-foreground">
                  {relatedWork}
                  {loadingRelatedWork && <span className="animate-pulse">▌</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Contradiction Detector ────────────────────────────────────── */}
        {tab === "contradictions" && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold">Contradiction Detector</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Find where papers disagree on findings or methodology
                </p>
              </div>
              <Button
                onClick={detectContradictions}
                disabled={loadingContradictions}
                size="sm"
              >
                {loadingContradictions ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                {loadingContradictions ? "Analysing…" : "Detect Contradictions"}
              </Button>
            </div>

            {!contradictions && !loadingContradictions && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center border border-dashed border-border rounded-xl">
                <Zap className="w-12 h-12 opacity-20 mb-3" />
                <p className="font-medium">Ready to analyse</p>
                <p className="text-sm mt-1 max-w-sm">
                  Requires at least 2 papers. AI will compare abstracts and identify conflicting findings.
                </p>
              </div>
            )}

            {loadingContradictions && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Comparing papers for contradictions…</p>
              </div>
            )}

            {contradictions && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1 text-sm font-medium text-primary">
                    <Sparkles className="w-4 h-4" />
                    Summary
                  </div>
                  <p className="text-sm text-muted-foreground">{contradictions.summary}</p>
                </div>

                {/* No contradictions found */}
                {contradictions.contradictions.length === 0 && (
                  <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-500/10 dark:border-green-500/30 p-4">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <p className="text-sm text-green-700 dark:text-green-400">
                      No significant contradictions detected across your papers.
                    </p>
                  </div>
                )}

                {/* Contradiction cards */}
                {contradictions.contradictions.map((c, i) => (
                  <div
                    key={i}
                    className={`border rounded-xl p-5 ${
                      c.severity === "major"
                        ? "border-red-200 bg-red-50/50 dark:bg-red-500/5 dark:border-red-500/30"
                        : "border-orange-200 bg-orange-50/50 dark:bg-orange-500/5 dark:border-orange-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle
                        className={`w-4 h-4 ${
                          c.severity === "major" ? "text-red-500" : "text-orange-500"
                        }`}
                      />
                      <span className="font-medium text-sm">{c.topic}</span>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] ml-auto ${
                          c.severity === "major"
                            ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400"
                            : "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400"
                        }`}
                      >
                        {c.severity}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-lg bg-background/60 p-3 border border-border">
                        <p className="text-[11px] font-medium text-muted-foreground mb-1 truncate" title={c.paper_a_title}>
                          {c.paper_a_title || `Paper ${c.paper_a_index}`}
                        </p>
                        <p className="text-sm">{c.claim_a}</p>
                      </div>
                      <div className="rounded-lg bg-background/60 p-3 border border-border">
                        <p className="text-[11px] font-medium text-muted-foreground mb-1 truncate" title={c.paper_b_title}>
                          {c.paper_b_title || `Paper ${c.paper_b_index}`}
                        </p>
                        <p className="text-sm">{c.claim_b}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Export ───────────────────────────────────────────────────── */}
        {tab === "export" && (
          <div className="max-w-xl">
            <h2 className="font-semibold mb-1">Export Project References</h2>
            <p className="text-xs text-muted-foreground mb-6">
              Download your project's bibliography in academic formats.
            </p>

            <div className="space-y-3">
              {/* BibTeX */}
              <div className="flex items-center justify-between bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">BibTeX (.bib)</p>
                    <p className="text-xs text-muted-foreground">
                      Import directly into LaTeX, Overleaf, or Zotero
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadFile(
                      `${API_BASE}/writing-tools/export/${selectedProject._id}/bibtex`,
                      `${selectedProject.name.replace(/ /g, "_")}.bib`
                    )
                  }
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>

              {/* LaTeX */}
              <div className="flex items-center justify-between bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">LaTeX Bibliography (.tex)</p>
                    <p className="text-xs text-muted-foreground">
                      Ready-to-paste <code className="text-[10px] bg-muted px-1 rounded">thebibliography</code> environment
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadFile(
                      `${API_BASE}/writing-tools/export/${selectedProject._id}/latex`,
                      `${selectedProject.name.replace(/ /g, "_")}_bibliography.tex`
                    )
                  }
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4">
              Exports include all papers saved to this project. Add papers via the Papers tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
