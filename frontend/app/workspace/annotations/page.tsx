"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Highlighter,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  AlertCircle,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}
function authHeaders(json = false) {
  const h: Record<string, string> = { Authorization: `Bearer ${getToken()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

const COLORS = [
  { id: "yellow", label: "Yellow", bg: "bg-yellow-200 dark:bg-yellow-500/30", dot: "bg-yellow-400" },
  { id: "green", label: "Green", bg: "bg-green-200 dark:bg-green-500/30", dot: "bg-green-400" },
  { id: "blue", label: "Blue", bg: "bg-blue-200 dark:bg-blue-500/30", dot: "bg-blue-400" },
  { id: "pink", label: "Pink", bg: "bg-pink-200 dark:bg-pink-500/30", dot: "bg-pink-400" },
  { id: "purple", label: "Purple", bg: "bg-purple-200 dark:bg-purple-500/30", dot: "bg-purple-400" },
];

function colorBg(c: string) {
  return COLORS.find((x) => x.id === c)?.bg ?? COLORS[0].bg;
}
function colorDot(c: string) {
  return COLORS.find((x) => x.id === c)?.dot ?? COLORS[0].dot;
}

interface ProjectPaper {
  _id: string;
  title: string;
  authors: string[];
}

interface Annotation {
  id: string;
  content: string;
  quote: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  author: { id: string; username: string; profile_picture: string | null };
}

function AnnotationCard({
  ann,
  currentUserId,
  onEdit,
  onDelete,
}: {
  ann: Annotation;
  currentUserId: string;
  onEdit: (ann: Annotation) => void;
  onDelete: (id: string) => void;
}) {
  const isOwn = ann.author.id === currentUserId;
  return (
    <div className={`rounded-xl p-4 border border-border ${colorBg(ann.color)}`}>
      {ann.quote && (
        <blockquote className="border-l-2 border-foreground/30 pl-3 italic text-xs text-foreground/70 mb-2 leading-relaxed">
          "{ann.quote}"
        </blockquote>
      )}
      <p className="text-sm leading-relaxed">{ann.content}</p>
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2 text-xs text-foreground/60">
          {ann.author.profile_picture ? (
            <img src={ann.author.profile_picture} className="w-4 h-4 rounded-full" alt="" />
          ) : (
            <div className="w-4 h-4 rounded-full bg-foreground/20 flex items-center justify-center text-[9px] font-bold">
              {ann.author.username[0]?.toUpperCase()}
            </div>
          )}
          <span>{ann.author.username}</span>
          <span>·</span>
          <span>{new Date(ann.created_at).toLocaleDateString()}</span>
        </div>
        {isOwn && (
          <div className="flex gap-1">
            <button onClick={() => onEdit(ann)} className="p-1 hover:text-primary transition-colors text-foreground/50">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(ann.id)} className="p-1 hover:text-destructive transition-colors text-foreground/50">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddAnnotationForm({
  paperId,
  projectId,
  onAdded,
  onCancel,
}: {
  paperId: string;
  projectId: string;
  onAdded: (ann: Annotation) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState("");
  const [quote, setQuote] = useState("");
  const [color, setColor] = useState("yellow");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE}/projects/${projectId}/papers/${paperId}/annotations`,
        {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ content, quote: quote || null, color }),
        }
      );
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      onAdded(data);
      toast.success("Annotation added");
    } catch {
      toast.error("Could not save annotation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-card">
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">
          Quoted text <span className="font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          placeholder="Paste the text you're highlighting…"
          className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">
          Your note <span className="text-destructive">*</span>
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add your comment or note…"
          rows={3}
          className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Colour:</span>
        <div className="flex gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setColor(c.id)}
              className={`w-5 h-5 rounded-full ${c.dot} ${
                color === c.id ? "ring-2 ring-offset-1 ring-foreground/50" : ""
              } transition-all`}
              title={c.label}
            />
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !content.trim()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function PaperAnnotations({
  paper,
  projectId,
  currentUserId,
}: {
  paper: ProjectPaper;
  projectId: string;
  currentUserId: string;
}) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editColor, setEditColor] = useState("yellow");

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/projects/${projectId}/papers/${paper._id}/annotations`,
        { headers: authHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setAnnotations(data.annotations || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [open, paper._id, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${API_BASE}/annotations/${id}`, { method: "DELETE", headers: authHeaders() });
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  const handleEditSave = async (id: string) => {
    try {
      await fetch(`${API_BASE}/annotations/${id}`, {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({ content: editContent, color: editColor }),
      });
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, content: editContent, color: editColor } : a))
      );
      setEditingId(null);
      toast.success("Updated");
    } catch {
      toast.error("Update failed");
    }
  };

  const startEdit = (ann: Annotation) => {
    setEditingId(ann.id);
    setEditContent(ann.content);
    setEditColor(ann.color);
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Paper header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/40 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{paper.title}</p>
          {paper.authors?.length > 0 && (
            <p className="text-xs text-muted-foreground truncate">
              {paper.authors.slice(0, 2).join(", ")}
              {paper.authors.length > 2 && " et al."}
            </p>
          )}
        </div>
        {annotations.length > 0 && (
          <Badge variant="secondary" className="text-[10px] gap-1 flex-shrink-0">
            <MessageSquare className="w-3 h-3" />
            {annotations.length}
          </Badge>
        )}
      </button>

      {/* Annotations body */}
      {open && (
        <div className="px-4 py-3 space-y-3 border-t border-border bg-background">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading annotations…
            </div>
          )}

          {!loading && annotations.length === 0 && !adding && (
            <p className="text-xs text-muted-foreground py-1">No annotations yet.</p>
          )}

          {!loading &&
            annotations.map((ann) =>
              editingId === ann.id ? (
                <div key={ann.id} className="border border-primary/30 rounded-xl p-3 space-y-2 bg-card">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={2}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none resize-none"
                  />
                  <div className="flex items-center gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setEditColor(c.id)}
                        className={`w-4 h-4 rounded-full ${c.dot} ${editColor === c.id ? "ring-2 ring-offset-1 ring-foreground/50" : ""}`}
                      />
                    ))}
                    <div className="ml-auto flex gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" onClick={() => handleEditSave(ann.id)}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <AnnotationCard
                  key={ann.id}
                  ann={ann}
                  currentUserId={currentUserId}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                />
              )
            )}

          {adding ? (
            <AddAnnotationForm
              paperId={paper._id}
              projectId={projectId}
              onAdded={(ann) => {
                setAnnotations((prev) => [...prev, ann]);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              Add annotation
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AnnotationsPage() {
  const { selectedProject } = useProject();
  const { user } = useAuth();
  const [papers, setPapers] = useState<ProjectPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPapers([]);
    setError(null);
    if (!selectedProject) return;
    setLoading(true);
    fetch(`${API_BASE}/projects/${selectedProject._id}/papers`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => setPapers(data))
      .catch(() => setError("Could not load papers"))
      .finally(() => setLoading(false));
  }, [selectedProject]);

  if (!selectedProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Highlighter className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No project selected</p>
          <p className="text-sm mt-1">Select a project to annotate papers.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Highlighter className="w-5 h-5 text-primary" />
          <div>
            <h1 className="font-semibold text-lg">Annotations</h1>
            <p className="text-xs text-muted-foreground">
              Highlight &amp; comment on papers in{" "}
              <span className="font-medium text-foreground">{selectedProject.name}</span>
              {" — "}shared with all project members
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            Loading papers…
          </div>
        )}

        {!loading && papers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
            <Highlighter className="w-12 h-12 opacity-20 mb-3" />
            <p className="font-medium">No papers yet</p>
            <p className="text-sm mt-1">Add papers to this project first.</p>
          </div>
        )}

        {!loading && papers.length > 0 && (
          <div className="max-w-2xl space-y-3">
            {papers.map((paper) => (
              <PaperAnnotations
                key={paper._id}
                paper={paper}
                projectId={selectedProject._id}
                currentUserId={user?._id || ""}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
