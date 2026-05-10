"use client";

import { useState, useEffect } from "react";
import {
  HelpCircle,
  Plus,
  Trash2,
  Tag,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  MinusCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PaperTag {
  paper_id: string;
  paper_title: string;
  stance: "supports" | "contradicts" | "partial";
  note?: string;
}

interface ResearchQuestion {
  _id: string;
  question: string;
  description?: string;
  paper_tags: PaperTag[];
  created_at: string;
}

interface Paper {
  _id: string;
  title: string;
  authors: string[];
}

const STANCE_META = {
  supports: { label: "Supports", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", border: "border-green-200" },
  contradicts: { label: "Contradicts", icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-200" },
  partial: { label: "Partial", icon: MinusCircle, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-200" },
};

export default function ResearchQuestionsPage() {
  const { selectedProject } = useProject();
  const [questions, setQuestions] = useState<ResearchQuestion[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New question form
  const [newQuestion, setNewQuestion] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);

  // Expand state
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Tag modal state
  const [tagging, setTagging] = useState<string | null>(null); // question_id
  const [tagPaperId, setTagPaperId] = useState("");
  const [tagStance, setTagStance] = useState<"supports" | "contradicts" | "partial">("supports");
  const [tagNote, setTagNote] = useState("");
  const [submittingTag, setSubmittingTag] = useState(false);

  const token = () => localStorage.getItem("token");

  useEffect(() => {
    if (!selectedProject) {
      setQuestions([]);
      setPapers([]);
      return;
    }
    fetchQuestions();
    fetchPapers();
  }, [selectedProject]);

  const fetchQuestions = async () => {
    if (!selectedProject) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/projects/${selectedProject._id}/research-questions`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("Failed to load questions");
      setQuestions(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPapers = async () => {
    if (!selectedProject) return;
    try {
      const res = await fetch(`${API}/projects/${selectedProject._id}/papers`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) setPapers(await res.json());
    } catch {
      // ignore
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !selectedProject) return;
    setAdding(true);
    try {
      const res = await fetch(`${API}/projects/${selectedProject._id}/research-questions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ question: newQuestion.trim(), description: newDesc.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Failed to add question");
      const q = await res.json();
      setQuestions((prev) => [q, ...prev]);
      setNewQuestion("");
      setNewDesc("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (questionId: string) => {
    if (!selectedProject || !confirm("Delete this research question?")) return;
    try {
      await fetch(`${API}/projects/${selectedProject._id}/research-questions/${questionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      setQuestions((prev) => prev.filter((q) => q._id !== questionId));
    } catch {
      alert("Failed to delete");
    }
  };

  const handleRemoveTag = async (questionId: string, paperId: string) => {
    if (!selectedProject) return;
    try {
      const res = await fetch(
        `${API}/projects/${selectedProject._id}/research-questions/${questionId}/tag-paper/${paperId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } }
      );
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setQuestions((prev) => prev.map((q) => (q._id === questionId ? updated : q)));
    } catch {
      alert("Failed to remove tag");
    }
  };

  const handleTagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagging || !tagPaperId || !selectedProject) return;
    setSubmittingTag(true);
    try {
      const res = await fetch(
        `${API}/projects/${selectedProject._id}/research-questions/${tagging}/tag-paper`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ paper_id: tagPaperId, stance: tagStance, note: tagNote || undefined }),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Failed to tag paper");
      }
      const updated = await res.json();
      setQuestions((prev) => prev.map((q) => (q._id === tagging ? updated : q)));
      setTagging(null);
      setTagPaperId("");
      setTagNote("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingTag(false);
    }
  };

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
        <HelpCircle className="w-12 h-12 opacity-20" />
        <p className="font-medium">No project selected</p>
        <p className="text-sm">Select a project to manage research questions.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <HelpCircle className="w-5 h-5 text-primary" />
          <div>
            <h1 className="font-semibold text-lg">Research Questions</h1>
            <p className="text-xs text-muted-foreground">
              Track your research questions and map evidence from papers
            </p>
          </div>
        </div>

        {/* Add question form */}
        <form onSubmit={handleAddQuestion} className="space-y-2">
          <Input
            placeholder="Enter a research question…"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={adding || !newQuestion.trim()}>
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Add
            </Button>
          </div>
        </form>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}

        {!loading && questions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <HelpCircle className="w-10 h-10 opacity-20" />
            <p className="font-medium">No research questions yet</p>
            <p className="text-sm">Add your first research question above.</p>
          </div>
        )}

        {questions.map((q) => {
          const isExpanded = expanded.has(q._id);
          const supporting = q.paper_tags.filter((t) => t.stance === "supports").length;
          const contradicting = q.paper_tags.filter((t) => t.stance === "contradicts").length;
          const partial = q.paper_tags.filter((t) => t.stance === "partial").length;

          return (
            <div key={q._id} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Question header */}
              <div
                className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(q._id)) next.delete(q._id);
                  else next.add(q._id);
                  return next;
                })}
              >
                <div className="mt-0.5 text-muted-foreground">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{q.question}</p>
                  {q.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{q.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    {supporting > 0 && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="w-3 h-3" /> {supporting} supporting
                      </span>
                    )}
                    {partial > 0 && (
                      <span className="flex items-center gap-1 text-xs text-yellow-600">
                        <MinusCircle className="w-3 h-3" /> {partial} partial
                      </span>
                    )}
                    {contradicting > 0 && (
                      <span className="flex items-center gap-1 text-xs text-red-600">
                        <XCircle className="w-3 h-3" /> {contradicting} contradicting
                      </span>
                    )}
                    {q.paper_tags.length === 0 && (
                      <span className="text-xs text-muted-foreground">No papers tagged</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setTagging(q._id);
                      setTagPaperId("");
                      setTagStance("supports");
                      setTagNote("");
                    }}
                  >
                    <Tag className="w-3 h-3 mr-1" />
                    Tag Paper
                  </Button>
                  <button
                    onClick={() => handleDelete(q._id)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Expanded paper tags */}
              {isExpanded && q.paper_tags.length > 0 && (
                <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
                  {q.paper_tags.map((tag) => {
                    const meta = STANCE_META[tag.stance];
                    const Icon = meta.icon;
                    return (
                      <div
                        key={tag.paper_id}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${meta.bg} ${meta.border}`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${meta.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-1">{tag.paper_title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="secondary" className="text-xs font-normal py-0">
                              {meta.label}
                            </Badge>
                            {tag.note && (
                              <span className="text-xs text-muted-foreground">{tag.note}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveTag(q._id, tag.paper_id)}
                          className="p-0.5 rounded hover:bg-black/10 text-muted-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tag paper modal */}
      {tagging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-xl border border-border shadow-lg w-full max-w-md p-6">
            <h2 className="font-semibold mb-4">Tag a Paper</h2>
            <form onSubmit={handleTagSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Paper</label>
                <select
                  value={tagPaperId}
                  onChange={(e) => setTagPaperId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select a paper…</option>
                  {papers.map((p) => (
                    <option key={p._id} value={p._id}>{p.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Stance</label>
                <div className="flex gap-2">
                  {(["supports", "contradicts", "partial"] as const).map((s) => {
                    const meta = STANCE_META[s];
                    const Icon = meta.icon;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setTagStance(s)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                          tagStance === s
                            ? `${meta.bg} ${meta.border} ${meta.color}`
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Note (optional)</label>
                <Input
                  placeholder="Brief note about how this paper relates…"
                  value={tagNote}
                  onChange={(e) => setTagNote(e.target.value)}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setTagging(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submittingTag || !tagPaperId}>
                  {submittingTag ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Tag Paper
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
