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
  SearchX,
  AlertTriangle,
  Compass,
  TrendingUp,
  CheckCircle2,
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
function downloadBlob(content: string | Uint8Array, filename: string, type: string) {
  const blob = new Blob([content as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Synthesis ────────────────────────────────────────────────────────────────

interface TopicResult { topic: string; summary: string; paper_ids: string[]; }
interface PaperMeta { id: string; title: string; authors: string[]; publication_date?: string | null; }

function SynthesisTab() {
  const { selectedProject } = useProject();
  const [topics, setTopics] = useState<TopicResult[]>([]);
  const [papersMeta, setPapersMeta] = useState<PaperMeta[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set([0]));
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [hasSynthesized, setHasSynthesized] = useState(false);
  const [isExporting, setIsExporting] = useState<"md" | "docx" | null>(null);

  useEffect(() => {
    setTopics([]); setPapersMeta([]); setHasSynthesized(false); setExpandedTopics(new Set([0]));
  }, [selectedProject]);

  const handleSynthesize = useCallback(async () => {
    if (!selectedProject) return;
    setIsSynthesizing(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${selectedProject._id}/synthesize`, { method: "POST", headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTopics(data.topics || []); setPapersMeta(data.papers || []);
        setHasSynthesized(true);
        if (data.topics?.length > 0) setExpandedTopics(new Set([0]));
        toast.success("Synthesis complete!");
      } else { toast.error("Synthesis failed."); }
    } catch { toast.error("Error during synthesis."); }
    finally { setIsSynthesizing(false); }
  }, [selectedProject]);

  const toggleExpand = (idx: number) => setExpandedTopics(prev => {
    const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next;
  });

  const getPaper = (id: string) => papersMeta.find(p => p.id === id);

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
          if (p) { const year = p.publication_date ? new Date(p.publication_date).getFullYear() : "n.d."; const authors = p.authors.length > 2 ? `${p.authors.slice(0, 2).join(", ")} et al.` : p.authors.join(", "); lines.push(`- ${p.title} (${authors}, ${year})`); }
        }
        lines.push("");
      }
    }
    const md = lines.join("\n");
    if (format === "md") { downloadBlob(md, `${base}_synthesis.md`, "text/markdown"); return; }
    setIsExporting("docx");
    try {
      const res = await fetch(`${API_BASE}/projects/export/convert-docx`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ title, content_md: md, filename: `${base}_synthesis` }) });
      if (!res.ok) throw new Error("Export failed");
      const buf = await res.arrayBuffer();
      downloadBlob(new Uint8Array(buf), `${base}_synthesis.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    } catch { toast.error("Export failed"); }
    finally { setIsExporting(null); }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b border-border bg-card px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-sm text-muted-foreground">AI-identified topics across papers in <span className="font-medium text-foreground">{selectedProject?.name}</span></p>
        </div>
        <div className="flex items-center gap-2">
          {hasSynthesized && topics.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleExport("md")} disabled={!!isExporting}><Download className="w-4 h-4 mr-1.5" />.md</Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("docx")} disabled={!!isExporting}>{isExporting === "docx" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileDown className="w-4 h-4 mr-1.5" />}.docx</Button>
            </>
          )}
          <Button variant="default" size="sm" onClick={handleSynthesize} disabled={isSynthesizing}>
            {isSynthesizing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : hasSynthesized ? <RefreshCw className="w-4 h-4 mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {isSynthesizing ? "Analyzing…" : hasSynthesized ? "Re-analyze" : "Analyze Topics"}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {!hasSynthesized && !isSynthesizing && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <FileSearch className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-medium text-lg mb-1">Ready to analyze</p>
              <p className="text-sm max-w-sm">Click <span className="font-medium text-foreground">"Analyze Topics"</span> to identify main topics across your saved papers.</p>
            </div>
          )}
          {isSynthesizing && (
            <div className="space-y-3 py-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="bg-card border border-border rounded-lg p-4">
                  <div className="h-5 w-2/3 rounded bg-muted animate-pulse mb-2" />
                  <div className="h-4 w-full rounded bg-muted animate-pulse mb-1" />
                  <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          )}
          {hasSynthesized && !isSynthesizing && topics.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">No topics found</p>
              <p className="text-sm mt-1">Save more papers to this project first, then re-analyze.</p>
            </div>
          )}
          {hasSynthesized && !isSynthesizing && topics.length > 0 && (
            <div className="space-y-3">
              {topics.map((topic, idx) => {
                const isExpanded = expandedTopics.has(idx);
                return (
                  <div key={idx} className="bg-card border border-border rounded-lg overflow-hidden">
                    <button className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-secondary/30 transition-colors" onClick={() => toggleExpand(idx)}>
                      <span className="text-sm font-medium text-muted-foreground mt-0.5">{idx + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm leading-snug">{topic.topic}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{topic.summary}</p>
                        <div className="flex items-center gap-2 mt-2"><Badge variant="outline" className="text-xs">{topic.paper_ids.length} paper{topic.paper_ids.length !== 1 ? "s" : ""}</Badge></div>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 border-t border-border">
                        <div className="pl-6 pt-3">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Papers discussing this topic</label>
                          <div className="space-y-2">
                            {topic.paper_ids.map(pid => {
                              const paper = getPaper(pid);
                              if (!paper) return null;
                              const year = paper.publication_date ? new Date(paper.publication_date).getFullYear() : null;
                              return (
                                <div key={pid} className="flex items-center gap-2 text-sm bg-secondary/50 rounded px-3 py-2">
                                  <span className="flex-1 line-clamp-1">{paper.authors.length > 0 ? `${paper.authors[0]}${paper.authors.length > 1 ? " et al." : ""}` : "Unknown"}{year ? ` (${year})` : ""} — <span className="text-muted-foreground">{paper.title}</span></span>
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

// ── Gap Analysis ──────────────────────────────────────────────────────────────

interface GapAnalysisResult { current_state: string; limitations: string[]; underexplored: string[]; future_directions: string[]; }
interface GapPaper { _id: string; title: string; }

function Section({ icon: Icon, title, color, items, isText, text }: { icon: React.ElementType; title: string; color: string; items?: string[]; isText?: boolean; text?: string; }) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3"><div className={`p-1.5 rounded-md ${color}`}><Icon className="w-4 h-4" /></div><h3 className="font-semibold text-sm">{title}</h3></div>
      {isText ? <p className="text-sm text-muted-foreground leading-relaxed">{text}</p> : (
        <ul className="space-y-2">{(items || []).map((item, i) => (<li key={i} className="flex items-start gap-2 text-sm text-muted-foreground"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" /><span className="leading-relaxed">{item}</span></li>))}</ul>
      )}
    </div>
  );
}

function GapAnalysisTab() {
  const { selectedProject } = useProject();
  const [papers, setPapers] = useState<GapPaper[]>([]);
  const [result, setResult] = useState<GapAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isPapersLoading, setIsPapersLoading] = useState(false);
  const [isExporting, setIsExporting] = useState<"md" | "docx" | null>(null);

  useEffect(() => { setResult(null); setHasAnalyzed(false); setPapers([]); }, [selectedProject]);

  const fetchPapers = useCallback(async () => {
    if (!selectedProject) return;
    setIsPapersLoading(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${selectedProject._id}/papers`, { headers: authHeaders() });
      if (res.ok) { const data: GapPaper[] = await res.json(); setPapers(data); }
    } catch { toast.error("Failed to load project papers."); }
    finally { setIsPapersLoading(false); }
  }, [selectedProject]);

  useEffect(() => { fetchPapers(); }, [fetchPapers]);

  const handleAnalyze = async () => {
    if (!selectedProject || papers.length === 0) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${selectedProject._id}/analyze-gaps`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ paper_ids: papers.map(p => p._id) }) });
      if (res.ok) { const data: GapAnalysisResult = await res.json(); setResult(data); setHasAnalyzed(true); toast.success("Gap analysis complete!"); }
      else { toast.error("Analysis failed. Please try again."); }
    } catch { toast.error("Error during gap analysis."); }
    finally { setIsAnalyzing(false); }
  };

  const handleExport = async (format: "md" | "docx") => {
    if (!result || !selectedProject) return;
    const base = selectedProject.name.replace(/\s+/g, "_").slice(0, 40);
    const title = `Research Gap Analysis — ${selectedProject.name}`;
    const lines = [`# ${title}`, "", "## Current State of the Field", "", result.current_state, ""];
    if (result.limitations.length) lines.push("## Key Limitations", "", ...result.limitations.map(l => `- ${l}`), "");
    if (result.underexplored.length) lines.push("## Underexplored Areas", "", ...result.underexplored.map(u => `- ${u}`), "");
    if (result.future_directions.length) lines.push("## Future Research Directions", "", ...result.future_directions.map(f => `- ${f}`), "");
    const md = lines.join("\n");
    if (format === "md") { downloadBlob(md, `${base}_gap_analysis.md`, "text/markdown"); return; }
    setIsExporting("docx");
    try {
      const res = await fetch(`${API_BASE}/projects/export/convert-docx`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ title, content_md: md, filename: `${base}_gap_analysis` }) });
      if (!res.ok) throw new Error("Export failed");
      const buf = await res.arrayBuffer();
      downloadBlob(new Uint8Array(buf), `${base}_gap_analysis.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    } catch { toast.error("Export failed"); }
    finally { setIsExporting(null); }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b border-border bg-card px-4 py-3 flex items-center justify-between flex-shrink-0">
        <p className="text-sm text-muted-foreground">AI-identified gaps in <span className="font-medium text-foreground">{selectedProject?.name}</span></p>
        <div className="flex items-center gap-2">
          {hasAnalyzed && result && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleExport("md")} disabled={!!isExporting}><Download className="w-4 h-4 mr-1.5" />.md</Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("docx")} disabled={!!isExporting}>{isExporting === "docx" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileDown className="w-4 h-4 mr-1.5" />}.docx</Button>
            </>
          )}
          <Button variant="default" size="sm" onClick={handleAnalyze} disabled={isAnalyzing || isPapersLoading || papers.length === 0}>
            {isAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : hasAnalyzed ? <RefreshCw className="w-4 h-4 mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {isAnalyzing ? "Analyzing…" : hasAnalyzed ? "Re-analyze" : "Analyze Gaps"}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {!hasAnalyzed && !isAnalyzing && papers.length === 0 && !isPapersLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <FileText className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-medium text-lg mb-1">No papers saved yet</p>
              <p className="text-sm max-w-sm">Go to the <span className="font-medium text-foreground">Papers</span> section and save papers first.</p>
            </div>
          )}
          {!hasAnalyzed && !isAnalyzing && papers.length > 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <SearchX className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-medium text-lg mb-1">Ready to analyze</p>
              <p className="text-sm max-w-sm">Click <span className="font-medium text-foreground">"Analyze Gaps"</span> to identify limitations and future directions across your {papers.length} saved paper{papers.length !== 1 ? "s" : ""}.</p>
            </div>
          )}
          {isAnalyzing && (
            <div className="space-y-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="bg-card border border-border rounded-lg p-5">
                  <div className="h-4 w-1/3 rounded bg-muted animate-pulse mb-3" />
                  <div className="space-y-2"><div className="h-3 w-full rounded bg-muted animate-pulse" /><div className="h-3 w-5/6 rounded bg-muted animate-pulse" /><div className="h-3 w-4/6 rounded bg-muted animate-pulse" /></div>
                </div>
              ))}
            </div>
          )}
          {hasAnalyzed && !isAnalyzing && result && (
            <div className="space-y-4">
              <Section icon={CheckCircle2} title="Current State of the Field" color="bg-blue-500/10 text-blue-500" isText text={result.current_state} />
              <Section icon={AlertTriangle} title="Key Limitations in Existing Research" color="bg-orange-500/10 text-orange-500" items={result.limitations} />
              <Section icon={Compass} title="Underexplored Research Areas" color="bg-purple-500/10 text-purple-500" items={result.underexplored} />
              <Section icon={TrendingUp} title="Promising Future Directions" color="bg-green-500/10 text-green-500" items={result.future_directions} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type AnalysisTab = "synthesis" | "gap-analysis";

export default function AnalysisPage() {
  const { selectedProject } = useProject();
  const [tab, setTab] = useState<AnalysisTab>("synthesis");

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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-5 h-5 text-primary" />
          <div>
            <h1 className="font-semibold text-lg">Analysis</h1>
            <p className="text-xs text-muted-foreground">Synthesis and gap analysis for <span className="font-medium text-foreground">{selectedProject.name}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-1 border-b border-border -mb-4">
          {([
            { id: "synthesis", label: "Evidence Synthesis", icon: FileSearch },
            { id: "gap-analysis", label: "Gap Analysis", icon: SearchX },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${tab === id ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "synthesis" ? <SynthesisTab /> : <GapAnalysisTab />}
    </div>
  );
}
