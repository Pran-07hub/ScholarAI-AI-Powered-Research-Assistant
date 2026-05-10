"use client";

import { useState, useEffect } from "react";
import {
  Columns,
  Loader2,
  AlertCircle,
  CheckSquare,
  Square,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Paper {
  _id: string;
  title: string;
  authors: string[];
  publication_date?: string;
  abstract?: string;
}

interface ComparisonMatrix {
  dimensions: string[];
  matrix: Array<{
    paper_index: number;
    title: string;
    id: string;
    authors?: string[];
    values: Record<string, string>;
  }>;
  summary: string;
}

export default function ComparePage() {
  const { selectedProject } = useProject();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [comparison, setComparison] = useState<ComparisonMatrix | null>(null);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProject) {
      setPapers([]);
      return;
    }
    const fetchPapers = async () => {
      setLoadingPapers(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API}/projects/${selectedProject._id}/papers`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setPapers(await res.json());
      } catch {
        // ignore
      } finally {
        setLoadingPapers(false);
      }
    };
    fetchPapers();
    setSelectedIds(new Set());
    setComparison(null);
  }, [selectedProject]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 5) {
        next.add(id);
      }
      return next;
    });
  };

  const handleCompare = async () => {
    if (selectedIds.size < 2 || !selectedProject) return;
    setComparing(true);
    setError(null);
    setComparison(null);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/projects/${selectedProject._id}/compare-papers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paper_ids: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Comparison failed");
      }
      setComparison(await res.json());
    } catch (err: any) {
      setError(err.message || "Comparison failed");
    } finally {
      setComparing(false);
    }
  };

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
        <Columns className="w-12 h-12 opacity-20" />
        <p className="font-medium">No project selected</p>
        <p className="text-sm">Select a project to compare papers.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Columns className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-lg">Compare Papers</h1>
              <p className="text-xs text-muted-foreground">
                Select 2–5 papers to generate an AI comparison matrix
              </p>
            </div>
          </div>
          <Button
            onClick={handleCompare}
            disabled={selectedIds.size < 2 || comparing}
            size="sm"
          >
            {comparing ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <BarChart2 className="w-4 h-4 mr-2" />
            )}
            Compare ({selectedIds.size}/5)
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Paper selection */}
        {!comparison && (
          <div>
            <h2 className="text-sm font-medium mb-3">
              Select papers{" "}
              <span className="text-muted-foreground font-normal">
                ({selectedIds.size} selected, max 5)
              </span>
            </h2>
            {loadingPapers ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading papers…
              </div>
            ) : papers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No papers in this project.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {papers.map((paper) => {
                  const selected = selectedIds.has(paper._id);
                  const disabled = !selected && selectedIds.size >= 5;
                  return (
                    <button
                      key={paper._id}
                      onClick={() => !disabled && toggleSelect(paper._id)}
                      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                        selected
                          ? "border-primary bg-primary/5"
                          : disabled
                          ? "border-border opacity-40 cursor-not-allowed"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0 text-primary">
                        {selected ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm line-clamp-2">{paper.title}</p>
                        {paper.authors && paper.authors.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {paper.authors.slice(0, 3).join(", ")}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Comparison result */}
        {comparing && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Generating comparison with AI…</p>
          </div>
        )}

        {comparison && !comparing && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-medium text-sm mb-2">Overall Comparison</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{comparison.summary}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => { setComparison(null); }}
              >
                ← Back to paper selection
              </Button>
            </div>

            {/* Comparison table */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground w-32">
                        Dimension
                      </th>
                      {comparison.matrix.map((row, i) => (
                        <th key={i} className="text-left px-4 py-3 font-medium text-xs min-w-48">
                          <p className="line-clamp-2">{row.title}</p>
                          {row.authors && row.authors.length > 0 && (
                            <p className="font-normal text-muted-foreground mt-0.5 truncate">
                              {row.authors.slice(0, 2).join(", ")}
                            </p>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.dimensions.map((dim, di) => (
                      <tr key={di} className={`border-b border-border ${di % 2 === 0 ? "" : "bg-muted/20"}`}>
                        <td className="px-4 py-3 font-medium text-xs text-muted-foreground align-top">
                          {dim}
                        </td>
                        {comparison.matrix.map((row, ri) => (
                          <td key={ri} className="px-4 py-3 text-xs align-top">
                            {row.values[dim] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
