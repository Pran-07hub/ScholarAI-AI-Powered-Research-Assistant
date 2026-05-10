"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Sparkles, Save, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";
import { toast } from "sonner";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Draft {
  _id: string;
  title: string;
  content: string;
  version: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function DraftsPage() {
  const { selectedProject } = useProject();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [improving, setImproving] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const token = () => localStorage.getItem("token");
  const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

  const fetchDrafts = async () => {
    if (!selectedProject) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/drafts/project/${selectedProject._id}`, { headers: headers() });
      if (res.ok) setDrafts(await res.json());
    } catch { toast.error("Failed to load drafts"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDrafts(); }, [selectedProject]);

  const selectDraft = (d: Draft) => {
    setSelected(d);
    setEditTitle(d.title);
    setEditContent(d.content);
  };

  const handleNew = async () => {
    if (!selectedProject) { toast.error("Select a project first"); return; }
    try {
      const res = await fetch(`${API}/drafts/`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ project_id: selectedProject._id, title: "Untitled Draft", content: "" }),
      });
      if (res.ok) {
        const d = await res.json();
        setDrafts(prev => [d, ...prev]);
        selectDraft(d);
        toast.success("New draft created");
      }
    } catch { toast.error("Failed to create draft"); }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/drafts/${selected._id}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ title: editTitle, content: editContent }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelected(updated);
        setDrafts(prev => prev.map(d => d._id === updated._id ? updated : d));
        toast.success("Saved");
      }
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const handleImprove = async () => {
    if (!selected) return;
    setImproving(true);
    try {
      // Save current content first
      await handleSave();
      const res = await fetch(`${API}/drafts/${selected._id}/ai-improve`, {
        method: "POST",
        headers: headers(),
      });
      if (res.ok) {
        const data = await res.json();
        setEditContent(data.improved_content);
        toast.success("AI improvement applied — review and save when ready.");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "AI improvement failed");
      }
    } catch { toast.error("AI improvement failed"); }
    finally { setImproving(false); }
  };

  const handleDelete = async (draftId: string) => {
    if (!confirm("Delete this draft?")) return;
    try {
      await fetch(`${API}/drafts/${draftId}`, { method: "DELETE", headers: headers() });
      setDrafts(prev => prev.filter(d => d._id !== draftId));
      if (selected?._id === draftId) setSelected(null);
      toast.success("Draft deleted");
    } catch { toast.error("Delete failed"); }
  };

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a project to view drafts.
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-72 border-r border-border flex flex-col bg-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm">Drafts</h2>
          <Button size="sm" variant="outline" onClick={handleNew}>
            <Plus className="w-3 h-3 mr-1" /> New
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center h-20 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center mt-8">No drafts yet.</p>
          ) : (
            drafts.map(d => (
              <div
                key={d._id}
                className={`group flex items-start gap-2 p-3 rounded-lg cursor-pointer mb-1 ${
                  selected?._id === d._id ? "bg-secondary" : "hover:bg-secondary/50"
                }`}
                onClick={() => selectDraft(d)}
              >
                <FileText className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-xs px-1.5 py-0">{d.status}</Badge>
                    <span className="text-xs text-muted-foreground">v{d.version}</span>
                  </div>
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={e => { e.stopPropagation(); handleDelete(d._id); }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      {selected ? (
        <div className="flex-1 flex flex-col">
          <div className="border-b border-border p-4 flex items-center gap-3">
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="flex-1 text-lg font-semibold bg-transparent border-none outline-none"
              placeholder="Draft title..."
            />
            <Button size="sm" variant="outline" onClick={handleImprove} disabled={improving}>
              {improving ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1.5" />}
              AI Improve
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Save className="w-3 h-3 mr-1.5" />}
              Save
            </Button>
          </div>
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            placeholder="Start writing your draft..."
            className="flex-1 resize-none p-6 bg-background text-sm font-mono outline-none"
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-3">
          <FileText className="w-10 h-10 opacity-30" />
          <p>Select a draft or create a new one.</p>
          <Button variant="outline" size="sm" onClick={handleNew}>
            <Plus className="w-3 h-3 mr-1" /> New Draft
          </Button>
        </div>
      )}
    </div>
  );
}
