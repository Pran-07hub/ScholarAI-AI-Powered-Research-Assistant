"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Download,
  Sparkles,
  Edit2,
  Check,
  X,
  Loader2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/context/ProjectContext";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const EXTRACTION_COLUMNS = [
  { id: "sample_size", label: "Sample Size", prompt: "Total participants / samples" },
  { id: "study_type", label: "Study Type", prompt: "Study design (RCT, meta-analysis, etc.)" },
  { id: "effect_size", label: "Effect Size", prompt: "Primary effect size or key finding" },
  { id: "population", label: "Population", prompt: "Study population demographics" },
  { id: "methodology", label: "Methodology", prompt: "Research methodology summary" },
];

interface RealPaper {
  _id: string;
  title: string;
  authors: string[];
  abstract?: string;
  publication_date?: string;
  extracted_data?: Record<string, string>;
}

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };
}

export default function Extraction() {
  const { selectedProject } = useProject();
  const [papers, setPapers] = useState<RealPaper[]>([]);
  const [extractedData, setExtractedData] = useState<Record<string, Record<string, string>>>({});
  const [isPapersLoading, setIsPapersLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [editingCell, setEditingCell] = useState<{ paperId: string; columnId: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingCell, setSavingCell] = useState<{ paperId: string; columnId: string } | null>(null);

  // ── Fetch project's saved papers ──────────────────────────────────────────
  const fetchPapers = useCallback(async () => {
    if (!selectedProject) return;
    setIsPapersLoading(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${selectedProject._id}/papers`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data: RealPaper[] = await res.json();
        setPapers(data);
        // Seed local state from any already-persisted extraction data
        const initial: Record<string, Record<string, string>> = {};
        data.forEach((p) => {
          initial[p._id] = { ...(p.extracted_data || {}) };
        });
        setExtractedData(initial);
      } else {
        toast.error("Failed to load papers for this project.");
      }
    } catch {
      toast.error("Error loading papers.");
    } finally {
      setIsPapersLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  // ── AI bulk extraction ────────────────────────────────────────────────────
  const handleExtractAll = async () => {
    if (!selectedProject) return;
    setIsExtracting(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${selectedProject._id}/papers/extract-all`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const updated: Record<string, Record<string, string>> = {};
        (data.papers as RealPaper[]).forEach((p) => {
          updated[p._id] = { ...(p.extracted_data || {}) };
        });
        setExtractedData(updated);
        toast.success("AI extraction complete!");
      } else {
        toast.error("AI extraction failed.");
      }
    } catch {
      toast.error("Error during extraction.");
    } finally {
      setIsExtracting(false);
    }
  };

  // ── Inline cell editing ───────────────────────────────────────────────────
  const startEdit = (paperId: string, columnId: string, currentValue: string) => {
    setEditingCell({ paperId, columnId });
    setEditValue(currentValue === "—" ? "" : currentValue);
  };

  const saveEdit = async () => {
    if (!editingCell || !selectedProject) return;
    const { paperId, columnId } = editingCell;
    const trimmed = editValue.trim();

    // Optimistic update
    setExtractedData((prev) => ({
      ...prev,
      [paperId]: { ...prev[paperId], [columnId]: trimmed || "—" },
    }));
    setEditingCell(null);

    setSavingCell({ paperId, columnId });
    try {
      const res = await fetch(
        `${API_BASE}/projects/${selectedProject._id}/papers/${paperId}/extraction`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ field: columnId, value: trimmed || "Not specified" }),
        }
      );
      if (!res.ok) toast.error("Failed to save edit.");
    } catch {
      toast.error("Error saving edit.");
    } finally {
      setSavingCell(null);
    }
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  // ── CSV Export ────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = ["Paper", "Authors", "Year", ...EXTRACTION_COLUMNS.map((c) => c.label)];
    const rows = papers.map((p) => {
      const year = p.publication_date ? new Date(p.publication_date).getFullYear() : "N/A";
      const extracted = extractedData[p._id] || {};
      return [
        `"${p.title.replace(/"/g, '""')}"`,
        `"${p.authors.join(", ").replace(/"/g, '""')}"`,
        year,
        ...EXTRACTION_COLUMNS.map((c) => `"${(extracted[c.id] || "").replace(/"/g, '""')}"`),
      ];
    });
    const csvContent = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedProject?.name || "extraction"}_data.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────
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
            <h1 className="text-xl font-semibold">Data Extraction</h1>
            <p className="text-sm text-muted-foreground">
              Structured data extracted from papers in{" "}
              <span className="font-medium text-foreground">{selectedProject.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleExtractAll}
              disabled={isExtracting || isPapersLoading || papers.length === 0}
            >
              {isExtracting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {isExtracting ? "Extracting…" : "Extract All (AI)"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={papers.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="ai-badge">
            <Sparkles className="w-3 h-3" />
            AI-Extracted •{" "}
            {isPapersLoading ? "loading…" : `${papers.length} paper${papers.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* Content */}
      {isPapersLoading ? (
        // Loading skeleton
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : papers.length === 0 ? (
        // Empty state
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No papers saved yet</p>
            <p className="text-sm mt-1">
              Go to the <span className="font-medium">Papers</span> section and save papers to this project first.
            </p>
          </div>
        </div>
      ) : (
        // Spreadsheet table
        <div className="flex-1 overflow-auto">
          <div className="min-w-max">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-table-header border-b border-r border-border px-4 py-3 text-left font-medium text-muted-foreground min-w-[300px]">
                    Paper
                  </th>
                  {EXTRACTION_COLUMNS.map((col) => (
                    <th
                      key={col.id}
                      className="bg-table-header border-b border-r border-border px-4 py-3 text-left font-medium text-muted-foreground min-w-[200px]"
                    >
                      <div>{col.label}</div>
                      <p className="text-xs font-normal text-muted-foreground/60 mt-0.5 line-clamp-1">
                        {col.prompt}
                      </p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {papers.map((paper, rowIndex) => (
                  <tr key={paper._id} className={rowIndex % 2 === 0 ? "" : "bg-table-alt"}>
                    {/* Paper title / authors */}
                    <td className="border-b border-r border-border px-4 py-3 min-w-[300px]">
                      <div className="font-medium text-sm line-clamp-2">{paper.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {paper.authors.length > 0
                          ? `${paper.authors[0]}${paper.authors.length > 1 ? " et al." : ""}`
                          : "Unknown author"}
                        {paper.publication_date
                          ? ` (${new Date(paper.publication_date).getFullYear()})`
                          : ""}
                      </div>
                    </td>

                    {/* Extraction columns */}
                    {EXTRACTION_COLUMNS.map((col) => {
                      const isEditing =
                        editingCell?.paperId === paper._id && editingCell?.columnId === col.id;
                      const isSaving =
                        savingCell?.paperId === paper._id && savingCell?.columnId === col.id;
                      const cellLoading = isExtracting && !extractedData[paper._id]?.[col.id];
                      const value = extractedData[paper._id]?.[col.id] || "—";

                      return (
                        <td
                          key={col.id}
                          className="border-b border-r border-border px-4 py-3 min-w-[200px]"
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="flex-1 px-2 py-1 text-sm border border-primary rounded focus:outline-none bg-background"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEdit();
                                  if (e.key === "Escape") cancelEdit();
                                }}
                              />
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveEdit}>
                                <Check className="w-3 h-3 text-green-500" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEdit}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : cellLoading || isSaving ? (
                            <div className="h-5 w-full rounded bg-muted animate-pulse" />
                          ) : (
                            <div
                              className="group flex items-center justify-between cursor-pointer hover:bg-secondary/50 -mx-2 px-2 py-1 rounded"
                              onClick={() => startEdit(paper._id, col.id, value)}
                            >
                              <span className="text-sm">{value}</span>
                              <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}