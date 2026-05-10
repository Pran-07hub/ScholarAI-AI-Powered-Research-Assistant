"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Save, Bold, Italic, List, ListOrdered, Quote, Image as ImageIcon, Undo, Redo, Plus, FileText, Trash2, Loader2, WandSparkles, StickyNote, PenLine, Zap, Download, AlertCircle, Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Copy, Check, Lock, Globe, Users, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useProject } from "@/context/ProjectContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Writing Tools types ───────────────────────────────────────────────────────
type WritingTab = "related-work" | "contradictions" | "export";

interface Contradiction {
  paper_a_index: number; paper_b_index: number; paper_a_title: string; paper_b_title: string;
  topic: string; claim_a: string; claim_b: string; severity: "major" | "minor";
}
interface ContradictionResult { contradictions: Contradiction[]; summary: string; }

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
      {copied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

// ── Note type ─────────────────────────────────────────────────────────────────
interface Note {
  _id?: string;
  id?: string;
  project_id: string;
  title: string;
  content: string;
  tags?: string[];
  is_private?: boolean;
  allowed_collaborators?: string[];
  created_at?: string;
  updated_at?: string;
}

interface ProjectMember {
  id: string;
  username: string;
  email: string;
  role: string;
}

export default function Notes() {
  const { selectedProject } = useProject();
  const { user } = useAuth();
  const isOwner = !!(user && selectedProject && user._id === selectedProject.user_id);

  // Project collaborators (members only, not owner) — fetched when owner views a note
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const [section, setSection] = useState<"notes" | "writing-tools">("notes");

  // Writing Tools state
  const [writingTab, setWritingTab] = useState<WritingTab>("related-work");
  const [relatedWork, setRelatedWork] = useState("");
  const [loadingRelatedWork, setLoadingRelatedWork] = useState(false);
  const [contradictions, setContradictions] = useState<ContradictionResult | null>(null);
  const [loadingContradictions, setLoadingContradictions] = useState(false);
  const [writingError, setWritingError] = useState<string | null>(null);

  useEffect(() => { setRelatedWork(""); setContradictions(null); setWritingError(null); }, [selectedProject]);

  const generateRelatedWork = async () => {
    if (!selectedProject) return toast.info("Select a project first");
    setLoadingRelatedWork(true); setRelatedWork(""); setWritingError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/writing-tools/related-work/${selectedProject._id}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
      if (!res.ok || !res.body) throw new Error("Failed");
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      while (true) { const { done, value } = await reader.read(); if (done) break; setRelatedWork(prev => prev + decoder.decode(value)); }
    } catch { setWritingError("Could not generate related work section."); }
    finally { setLoadingRelatedWork(false); }
  };

  const detectContradictions = async () => {
    if (!selectedProject) return toast.info("Select a project first");
    setLoadingContradictions(true); setContradictions(null); setWritingError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/writing-tools/contradictions/${selectedProject._id}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
      if (!res.ok) throw new Error("Failed");
      setContradictions(await res.json());
    } catch { setWritingError("Could not analyse contradictions."); }
    finally { setLoadingContradictions(false); }
  };

  const downloadFile = (url: string, filename: string) => {
    const token = localStorage.getItem("token");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.blob()).then(blob => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href); }).catch(() => toast.error("Download failed"));
  };

  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [content, setContent] = useState("");
  const [isSaved, setIsSaved] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // AI Generation State
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Undo / Redo history
  const [history, setHistory] = useState<string[]>([""]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const historyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedSelection = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  const getNoteId = (note: Note) => note._id || note.id || "";

  // ── Push to undo history (debounced) ──────────────────────────────────────
  const pushHistory = useCallback(
    (value: string) => {
      if (historyTimeout.current) clearTimeout(historyTimeout.current);
      historyTimeout.current = setTimeout(() => {
        setHistory((prev) => {
          const trimmed = prev.slice(0, historyIdx + 1);
          return [...trimmed, value];
        });
        setHistoryIdx((prev) => prev + 1);
      }, 400);
    },
    [historyIdx]
  );

  // ── Fetch project members (for privacy settings, owner only) ─────────────
  useEffect(() => {
    if (!selectedProject || !isOwner) { setProjectMembers([]); return; }
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/projects/${selectedProject._id}/members`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        // Exclude the owner from the collaborator list
        const members = (data.members || []).filter((m: ProjectMember) => m.role !== "owner");
        setProjectMembers(members);
      })
      .catch(() => setProjectMembers([]));
  }, [selectedProject, isOwner]);

  // ── Fetch notes ───────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchNotes = async () => {
      if (!selectedProject) {
        setNotes([]);
        setSelectedNote(null);
        setContent("");
        return;
      }
      setIsLoading(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/notes/?project_id=${selectedProject._id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setNotes(data);
          if (data.length > 0) {
            setSelectedNote(data[0]);
            setContent(data[0].content);
            setHistory([data[0].content]);
            setHistoryIdx(0);
            setIsSaved(true);
          } else {
            setSelectedNote(null);
            setContent("");
          }
        }
      } catch (err) {
        console.error("Failed to fetch notes", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchNotes();
  }, [selectedProject]);

  // ── Content change handler ────────────────────────────────────────────────
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setIsSaved(false);
    pushHistory(newContent);
  };

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const handleUndo = () => {
    if (historyIdx > 0) {
      const newIdx = historyIdx - 1;
      setHistoryIdx(newIdx);
      setContent(history[newIdx]);
      setIsSaved(false);
    }
  };

  const handleRedo = () => {
    if (historyIdx < history.length - 1) {
      const newIdx = historyIdx + 1;
      setHistoryIdx(newIdx);
      setContent(history[newIdx]);
      setIsSaved(false);
    }
  };

  // ── Markdown formatting helpers ───────────────────────────────────────────
  const insertMarkdown = (before: string, after: string = "") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start, end } = savedSelection.current;
    const selected = content.substring(start, end);
    const replacement = `${before}${selected || "text"}${after}`;
    const newContent = content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);
    setIsSaved(false);
    pushHistory(newContent);
    // Restore cursor after the inserted text
    setTimeout(() => {
      ta.focus();
      const cursorPos = start + before.length + (selected.length || 4);
      ta.setSelectionRange(cursorPos, cursorPos);
      savedSelection.current = { start: cursorPos, end: cursorPos };
    }, 0);
  };

  const insertLinePrefix = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    // Find the beginning of the current line
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    const newContent = content.substring(0, lineStart) + prefix + content.substring(lineStart);
    setContent(newContent);
    setIsSaved(false);
    pushHistory(newContent);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  };

  const handleBold = () => insertMarkdown("**", "**");
  const handleItalic = () => insertMarkdown("*", "*");
  const handleBulletList = () => insertLinePrefix("- ");
  const handleNumberedList = () => insertLinePrefix("1. ");
  const handleQuote = () => insertLinePrefix("> ");

  // ── Image upload ──────────────────────────────────────────────────────────
  const handleImageClick = () => fileInputRef.current?.click();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are allowed.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/notes/upload-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        const imageUrl = `${API_BASE}${data.url}`;
        const markdownImg = `\n![${file.name}](${imageUrl})\n`;
        const ta = textareaRef.current;
        const pos = ta ? ta.selectionStart : content.length;
        const newContent = content.substring(0, pos) + markdownImg + content.substring(pos);
        setContent(newContent);
        setIsSaved(false);
        pushHistory(newContent);
        toast.success("Image uploaded!");
      } else {
        toast.error("Image upload failed.");
      }
    } catch {
      toast.error("Error uploading image.");
    }
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedProject || !selectedNote) return;

    setIsSaving(true);
    const token = localStorage.getItem("token");
    const noteId = getNoteId(selectedNote);

    try {
      if (noteId.startsWith("temp-")) {
        const res = await fetch(`${API_BASE}/notes/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            project_id: selectedProject._id,
            title: selectedNote.title,
            content: content,
            tags: [],
            is_private: selectedNote.is_private ?? false,
            allowed_collaborators: selectedNote.allowed_collaborators ?? [],
          }),
        });
        if (res.ok) {
          const newDbNote = await res.json();
          setNotes((prev) => prev.map((n) => (getNoteId(n) === noteId ? newDbNote : n)));
          setSelectedNote(newDbNote);
          setIsSaved(true);
          toast.success("Note created successfully");
        } else {
          toast.error("Failed to create note");
        }
      } else {
        const res = await fetch(`${API_BASE}/notes/${noteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            project_id: selectedProject._id,
            title: selectedNote.title,
            content: content,
            tags: selectedNote.tags || [],
            is_private: selectedNote.is_private ?? false,
            allowed_collaborators: selectedNote.allowed_collaborators ?? [],
          }),
        });
        if (res.ok) {
          const updatedNote = await res.json();
          setNotes((prev) => prev.map((n) => (getNoteId(n) === noteId ? updatedNote : n)));
          setSelectedNote(updatedNote);
          setIsSaved(true);
          toast.success("Note saved successfully");
        } else {
          toast.error("Failed to save note");
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("An error occurred while saving");
    } finally {
      setIsSaving(false);
    }
  };

  // ── AI Generation ─────────────────────────────────────────────────────────
  const handleAIGenerate = async () => {
    if (!selectedProject || !selectedNote) return;
    const noteId = getNoteId(selectedNote);
    if (noteId.startsWith("temp-")) {
      toast.error("Please save the note first before using AI generation.");
      return;
    }
    if (!aiPrompt.trim()) {
      toast.error("Please enter a prompt for the AI.");
      return;
    }

    setIsGenerating(true);
    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${API_BASE}/notes/${noteId}/ai-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: aiPrompt, chat_history: [] }),
      });

      if (res.ok) {
        const data = await res.json();
        const generatedText = data.generated_text;

        // Append generated text
        const newContent = content + (content.endsWith("\n") ? "" : "\n\n") + generatedText;
        handleContentChange(newContent);

        toast.success("AI Generation complete!");
        setIsAIOpen(false);
        setAiPrompt("");
      } else {
        const errorData = await res.json();
        toast.error(`AI Generation failed: ${errorData.detail || "Unknown error"}`);
      }
    } catch (e) {
      console.error(e);
      toast.error("An error occurred during AI generation");
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Select / Create / Delete helpers ──────────────────────────────────────
  const selectNote = (note: Note) => {
    if (!isSaved) {
      const confirm = window.confirm("You have unsaved changes. Discard them?");
      if (!confirm) return;
    }
    setSelectedNote(note);
    setContent(note.content);
    setHistory([note.content]);
    setHistoryIdx(0);
    setIsSaved(true);
  };

  const createNewNote = () => {
    if (!selectedProject) {
      toast.error("Please select a project first");
      return;
    }
    if (!isSaved) {
      const confirm = window.confirm("You have unsaved changes. Discard them?");
      if (!confirm) return;
    }
    const tempId = `temp-${Date.now()}`;
    const newNote: Note = {
      _id: tempId,
      project_id: selectedProject._id,
      title: "",
      content: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setNotes((prev) => [newNote, ...prev]);
    setSelectedNote(newNote);
    setContent(newNote.content);
    setHistory([newNote.content]);
    setHistoryIdx(0);
    setIsSaved(false);
  };

  const deleteNote = async (noteToDelete: Note) => {
    if (!selectedProject) return;
    const confirm = window.confirm("Are you sure you want to delete this note?");
    if (!confirm) return;

    const noteId = getNoteId(noteToDelete);

    if (noteId.startsWith("temp-")) {
      const remaining = notes.filter((n) => getNoteId(n) !== noteId);
      setNotes(remaining);
      if (remaining.length > 0) selectNote(remaining[0]);
      else { setSelectedNote(null); setContent(""); }
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/notes/${noteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const remaining = notes.filter((n) => getNoteId(n) !== noteId);
        setNotes(remaining);
        if (remaining.length > 0) selectNote(remaining[0]);
        else { setSelectedNote(null); setContent(""); }
        toast.success("Note deleted");
      } else {
        toast.error("Failed to delete note");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error deleting note");
    }
  };

  // ── Toolbar definition ────────────────────────────────────────────────────
  const toolbarButtons = [
    { icon: Bold, label: "Bold", action: handleBold },
    { icon: Italic, label: "Italic", action: handleItalic },
    { icon: ImageIcon, label: "Image", action: handleImageClick },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* Section tab bar */}
      <div className="border-b border-border bg-card px-4 flex items-center gap-1 flex-shrink-0">
        <button onClick={() => setSection("notes")} className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-colors ${section === "notes" ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <StickyNote className="w-3.5 h-3.5" /> Notes
        </button>
        <button onClick={() => setSection("writing-tools")} className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-colors ${section === "writing-tools" ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <PenLine className="w-3.5 h-3.5" /> Writing Tools
        </button>
      </div>

      {/* Writing Tools section */}
      {section === "writing-tools" && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="border-b border-border bg-card px-6 py-3 flex-shrink-0">
            <div className="flex items-center gap-1">
              {([
                { id: "related-work", label: "Related Work", icon: PenLine },
                { id: "contradictions", label: "Contradiction Detector", icon: Zap },
                { id: "export", label: "Export", icon: Download },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setWritingTab(id)} className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${writingTab === id ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {!selectedProject ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <PenLine className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No project selected</p>
                  <p className="text-sm mt-1">Select a project to use writing tools.</p>
                </div>
              </div>
            ) : (
              <>
                {writingError && (
                  <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm mb-4">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />{writingError}
                  </div>
                )}
                {writingTab === "related-work" && (
                  <div className="max-w-3xl">
                    <div className="flex items-center justify-between mb-4">
                      <div><h2 className="font-semibold">Related Work Generator</h2><p className="text-xs text-muted-foreground mt-0.5">AI drafts a related work section from your project papers</p></div>
                      <div className="flex gap-2">
                        {relatedWork && <CopyBtn text={relatedWork} />}
                        <Button onClick={generateRelatedWork} disabled={loadingRelatedWork} size="sm">
                          {loadingRelatedWork ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : relatedWork ? <RefreshCw className="w-4 h-4 mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                          {loadingRelatedWork ? "Generating…" : relatedWork ? "Regenerate" : "Generate"}
                        </Button>
                      </div>
                    </div>
                    {!relatedWork && !loadingRelatedWork && (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center border border-dashed border-border rounded-xl">
                        <PenLine className="w-12 h-12 opacity-20 mb-3" />
                        <p className="font-medium">Ready to generate</p>
                        <p className="text-sm mt-1 max-w-sm">Click <span className="font-medium text-foreground">Generate</span> to draft a related work section.</p>
                      </div>
                    )}
                    {relatedWork && (
                      <div className="bg-card border border-border rounded-xl p-6">
                        <div className="flex items-center gap-1.5 text-xs text-primary mb-3"><Sparkles className="w-3 h-3" /><span className="font-medium">AI-Generated Related Work Section</span></div>
                        <div className="text-sm leading-relaxed whitespace-pre-wrap font-serif text-foreground">{relatedWork}{loadingRelatedWork && <span className="animate-pulse">▌</span>}</div>
                      </div>
                    )}
                  </div>
                )}
                {writingTab === "contradictions" && (
                  <div className="max-w-3xl">
                    <div className="flex items-center justify-between mb-4">
                      <div><h2 className="font-semibold">Contradiction Detector</h2><p className="text-xs text-muted-foreground mt-0.5">Find where papers disagree on findings or methodology</p></div>
                      <Button onClick={detectContradictions} disabled={loadingContradictions} size="sm">
                        {loadingContradictions ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                        {loadingContradictions ? "Analysing…" : "Detect Contradictions"}
                      </Button>
                    </div>
                    {!contradictions && !loadingContradictions && (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center border border-dashed border-border rounded-xl">
                        <Zap className="w-12 h-12 opacity-20 mb-3" />
                        <p className="font-medium">Ready to analyse</p>
                        <p className="text-sm mt-1 max-w-sm">Requires at least 2 papers. AI will compare abstracts and identify conflicting findings.</p>
                      </div>
                    )}
                    {loadingContradictions && <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin text-primary" /><p className="text-sm">Comparing papers…</p></div>}
                    {contradictions && (
                      <div className="space-y-4">
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4"><div className="flex items-center gap-2 mb-1 text-sm font-medium text-primary"><Sparkles className="w-4 h-4" />Summary</div><p className="text-sm text-muted-foreground">{contradictions.summary}</p></div>
                        {contradictions.contradictions.length === 0 && (<div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-500/10 dark:border-green-500/30 p-4"><CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" /><p className="text-sm text-green-700 dark:text-green-400">No significant contradictions detected.</p></div>)}
                        {contradictions.contradictions.map((c, i) => (
                          <div key={i} className={`border rounded-xl p-5 ${c.severity === "major" ? "border-red-200 bg-red-50/50 dark:bg-red-500/5 dark:border-red-500/30" : "border-orange-200 bg-orange-50/50 dark:bg-orange-500/5 dark:border-orange-500/30"}`}>
                            <div className="flex items-center gap-2 mb-3"><AlertTriangle className={`w-4 h-4 ${c.severity === "major" ? "text-red-500" : "text-orange-500"}`} /><span className="font-medium text-sm">{c.topic}</span><Badge variant="secondary" className={`text-[10px] ml-auto ${c.severity === "major" ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400" : "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400"}`}>{c.severity}</Badge></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="rounded-lg bg-background/60 p-3 border border-border"><p className="text-[11px] font-medium text-muted-foreground mb-1 truncate">{c.paper_a_title || `Paper ${c.paper_a_index}`}</p><p className="text-sm">{c.claim_a}</p></div>
                              <div className="rounded-lg bg-background/60 p-3 border border-border"><p className="text-[11px] font-medium text-muted-foreground mb-1 truncate">{c.paper_b_title || `Paper ${c.paper_b_index}`}</p><p className="text-sm">{c.claim_b}</p></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {writingTab === "export" && (
                  <div className="max-w-xl">
                    <h2 className="font-semibold mb-1">Export Project References</h2>
                    <p className="text-xs text-muted-foreground mb-6">Download your project's bibliography in academic formats.</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center"><FileText className="w-5 h-5 text-blue-500" /></div><div><p className="font-medium text-sm">BibTeX (.bib)</p><p className="text-xs text-muted-foreground">Import into LaTeX, Overleaf, or Zotero</p></div></div>
                        <Button variant="outline" size="sm" onClick={() => downloadFile(`${API_BASE}/writing-tools/export/${selectedProject._id}/bibtex`, `${selectedProject.name.replace(/ /g, "_")}.bib`)}><Download className="w-4 h-4 mr-2" />Download</Button>
                      </div>
                      <div className="flex items-center justify-between bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center"><FileText className="w-5 h-5 text-purple-500" /></div><div><p className="font-medium text-sm">LaTeX Bibliography (.tex)</p><p className="text-xs text-muted-foreground">Ready-to-paste thebibliography environment</p></div></div>
                        <Button variant="outline" size="sm" onClick={() => downloadFile(`${API_BASE}/writing-tools/export/${selectedProject._id}/latex`, `${selectedProject.name.replace(/ /g, "_")}_bibliography.tex`)}><Download className="w-4 h-4 mr-2" />Download</Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Notes section */}
      {section === "notes" && (
    <div className="flex-1 flex overflow-hidden">
      {/* Hidden file input for image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* Notes Sidebar */}
      {sidebarVisible && (
      <div className="w-64 border-r border-border bg-card flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium">Notes</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={createNewNote} disabled={!selectedProject}>
              <Plus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSidebarVisible(false)} title="Hide sidebar">
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {notes.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No notes in this project.
              </div>
            ) : (
              notes.map((note) => (
                <button
                  key={getNoteId(note)}
                  onClick={() => selectNote(note)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedNote && getNoteId(selectedNote) === getNoteId(note)
                      ? "bg-secondary"
                      : "hover:bg-secondary/50"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium line-clamp-1 flex-1">{note.title}</span>
                    {note.is_private && <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                  </div>
                  {note.updated_at && (
                    <div className="text-xs text-muted-foreground mt-1 pl-6">
                      {new Date(note.updated_at).toLocaleDateString()}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      )}

      {/* Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedNote ? (
          <div className="flex-1 flex items-center justify-center flex-col text-muted-foreground">
            {!sidebarVisible && (
              <Button variant="ghost" size="sm" className="absolute top-3 left-3" onClick={() => setSidebarVisible(true)} title="Show sidebar">
                <PanelLeftOpen className="w-4 h-4" />
              </Button>
            )}
            <FileText className="w-12 h-12 mb-4 opacity-20" />
            <p>Select a note or create a new one to start writing</p>
            {!selectedProject && (
              <p className="text-xs mt-2 text-destructive">
                Please select a project from the top left dropdown
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="border-b border-border bg-card px-4 py-2 flex items-center gap-1 overflow-x-auto">
              {/* Show sidebar toggle — only visible when sidebar is hidden */}
              {!sidebarVisible && (
                <Button variant="ghost" size="icon" className="h-8 w-8 min-w-[32px]" onClick={() => setSidebarVisible(true)} title="Show sidebar">
                  <PanelLeftOpen className="w-4 h-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 min-w-[32px]" onClick={handleUndo} disabled={historyIdx <= 0} title="Undo">
                <Undo className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 min-w-[32px]" onClick={handleRedo} disabled={historyIdx >= history.length - 1} title="Redo">
                <Redo className="w-4 h-4" />
              </Button>
              <Separator orientation="vertical" className="mx-2 h-6 hidden sm:block" />
              {toolbarButtons.map((btn) => (
                <Button
                  key={btn.label}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 min-w-[32px] hidden sm:inline-flex"
                  title={btn.label}
                  onClick={btn.action}
                >
                  <btn.icon className="w-4 h-4" />
                </Button>
              ))}
              <Separator orientation="vertical" className="mx-2 h-6 hidden sm:block" />
              <Dialog open={isAIOpen} onOpenChange={setIsAIOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 min-w-[32px] text-primary" title="Generate with AI">
                    <WandSparkles className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generate with AI</DialogTitle>
                    <DialogDescription>
                      Give the AI a prompt to generate or expand your note content.
                    </DialogDescription>
                  </DialogHeader>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="w-full min-h-[100px] bg-background border rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="E.g., Summarize the main points of this note..."
                    disabled={isGenerating}
                  />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAIOpen(false)} disabled={isGenerating}>Cancel</Button>
                    <Button onClick={handleAIGenerate} disabled={isGenerating}>
                      {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <WandSparkles className="w-4 h-4 mr-2" />}
                      Generate
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {/* Privacy Settings — owner only */}
              {isOwner && (
                <Dialog open={isPrivacyOpen} onOpenChange={setIsPrivacyOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 min-w-[32px]" title="Privacy settings">
                      {selectedNote.is_private ? <Lock className="w-4 h-4 text-amber-500" /> : <Globe className="w-4 h-4 text-muted-foreground" />}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Note Privacy</DialogTitle>
                      <DialogDescription>
                        Control who can see this note. Only you (owner) can change these settings.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      {/* Private toggle */}
                      <div className="flex items-center justify-between rounded-lg border border-border p-4">
                        <div className="flex items-center gap-3">
                          <Lock className="w-4 h-4 text-amber-500" />
                          <div>
                            <p className="text-sm font-medium">Private</p>
                            <p className="text-xs text-muted-foreground">Only you can see this note</p>
                          </div>
                        </div>
                        <button
                          role="switch"
                          aria-checked={selectedNote.is_private ?? false}
                          onClick={() => {
                            setSelectedNote((prev) => prev ? { ...prev, is_private: !(prev.is_private ?? false) } : null);
                            setIsSaved(false);
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${(selectedNote.is_private ?? false) ? "bg-primary" : "bg-muted"}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${(selectedNote.is_private ?? false) ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </div>

                      {/* Collaborator access — only when not private */}
                      {!(selectedNote.is_private ?? false) && projectMembers.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <p className="text-sm font-medium">Collaborator Access</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {(selectedNote.allowed_collaborators ?? []).length === 0
                              ? "All collaborators can see this note."
                              : "Only selected collaborators can see this note."}
                          </p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {projectMembers.map((member) => {
                              const isChecked = (selectedNote.allowed_collaborators ?? []).length === 0 ||
                                (selectedNote.allowed_collaborators ?? []).includes(member.id);
                              return (
                                <label key={member.id} className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-secondary/50">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const current = selectedNote.allowed_collaborators ?? [];
                                      // When going from "all" (empty) to restricted, start with all members
                                      const base = current.length === 0 ? projectMembers.map((m) => m.id) : current;
                                      let updated: string[];
                                      if (e.target.checked) {
                                        updated = base.includes(member.id) ? base : [...base, member.id];
                                      } else {
                                        updated = base.filter((id) => id !== member.id);
                                      }
                                      // If all members are selected, reset to empty (means all)
                                      if (updated.length === projectMembers.length) updated = [];
                                      setSelectedNote((prev) => prev ? { ...prev, allowed_collaborators: updated } : null);
                                      setIsSaved(false);
                                    }}
                                    className="rounded"
                                  />
                                  <div>
                                    <p className="text-sm font-medium">{member.username}</p>
                                    <p className="text-xs text-muted-foreground">{member.email}</p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsPrivacyOpen(false)}>Cancel</Button>
                      <Button onClick={() => { setIsPrivacyOpen(false); handleSave(); }}>
                        <Save className="w-4 h-4 mr-2" />Save Settings
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              <div className="flex-1" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:inline-block">
                  {isSaving ? "Saving..." : isSaved ? "Saved" : "Unsaved changes"}
                </span>
                <Button
                  variant={isSaved ? "ghost" : "default"}
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaved || isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteNote(selectedNote)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-6 overflow-auto">
              <div className="max-w-3xl mx-auto h-full flex flex-col">
                <input
                  type="text"
                  value={selectedNote.title}
                  onChange={(e) => {
                    setNotes((prev) =>
                      prev.map((note) =>
                        getNoteId(note) === getNoteId(selectedNote)
                          ? { ...note, title: e.target.value }
                          : note
                      )
                    );
                    setSelectedNote((prev) =>
                      prev ? { ...prev, title: e.target.value } : null
                    );
                    setIsSaved(false);
                  }}
                  className="w-full text-2xl font-semibold bg-transparent border-none outline-none mb-4 shrink-0 placeholder:text-muted-foreground/50"
                  placeholder="Note title..."
                />

                <Tabs defaultValue="write" className="flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <TabsList>
                      <TabsTrigger value="write">Write</TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="write" className="flex-1 bg-transparent border-none outline-none m-0 p-0 h-full data-[state=active]:flex flex-col">
                    <textarea
                      ref={textareaRef}
                      value={content}
                      onChange={(e) => handleContentChange(e.target.value)}
                      onSelect={(e) => {
                        const ta = e.currentTarget;
                        savedSelection.current = { start: ta.selectionStart, end: ta.selectionEnd };
                      }}
                      onBlur={(e) => {
                        savedSelection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd };
                      }}
                      className="w-full min-h-[500px] h-full flex-1 bg-transparent border-none outline-none resize-none text-sm leading-relaxed font-mono placeholder:text-muted-foreground/50"
                      placeholder="Start writing in Markdown..."
                    />
                  </TabsContent>

                  <TabsContent value="preview" className="flex-1 bg-card rounded-md border p-6 m-0 h-full min-h-[500px] overflow-auto data-[state=active]:block [&>h1]:text-3xl [&>h1]:font-bold [&>h1]:mb-4 [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:mb-3 [&>h3]:text-xl [&>h3]:font-semibold [&>h3]:mb-2 [&>p]:mb-4 [&>ul]:list-disc [&>ul]:ml-6 [&>ul]:mb-4 [&>ol]:list-decimal [&>ol]:ml-6 [&>ol]:mb-4 [&>li]:mb-1 [&>blockquote]:border-l-4 [&>blockquote]:border-primary [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-muted-foreground [&>code]:bg-muted [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded-md [&>pre]:bg-muted [&>pre]:p-4 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>pre]:mb-4 [&>a]:text-primary [&>a]:underline">
                    {content ? (
                      <ReactMarkdown>{content}</ReactMarkdown>
                    ) : (
                      <div className="text-muted-foreground/50 text-sm h-full flex items-center justify-center">
                        Preview will appear here...
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
      )}
    </div>
  );
}
