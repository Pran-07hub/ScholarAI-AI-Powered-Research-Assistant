"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  Send, Loader2, User, Sparkles, ExternalLink, Plus, Check, FileText, Square, Trash2, Edit2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useProject } from "@/context/ProjectContext";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useQueryClient } from "@tanstack/react-query";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Paper {
  title: string;
  authors: string[];
  summary: string;
  source: string;
  published_date: string;
  url: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function ChatSession() {
  const params = useParams<{ id: string }>();
  const chatId = params.id;
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const router = useRouter();
  const queryClient = useQueryClient();

  const [chatTitle, setChatTitle] = useState("Chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [currentPapers, setCurrentPapers] = useState<Paper[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [savedPaperUrls, setSavedPaperUrls] = useState<Set<string>>(new Set());
  const [selectedSearchPapers, setSelectedSearchPapers] = useState<Set<string>>(new Set());
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [libraryPapers, setLibraryPapers] = useState<any[]>([]);
  const [activeContextIds, setActiveContextIds] = useState<Set<string>>(new Set());
  const [isLoadingChat, setIsLoadingChat] = useState(true);

  const { selectedProject, triggerPapersRefresh } = useProject();
  const streamRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasSentInitialQuery = useRef(false);

  const token = () => localStorage.getItem("token");
  const authHeaders = () => ({ Authorization: `Bearer ${token()}` });

  // ── Load existing chat from backend ──────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const loadChat = async () => {
      setIsLoadingChat(true);
      try {
        const res = await fetch(`${API}/chats/${chatId}`, { headers: authHeaders() });
        if (!res.ok) {
          if (isMounted) router.push("/workspace");
          return;
        }
        const data = await res.json();
        if (!isMounted) return;
        setChatTitle(data.title || "Chat");
        const loaded: Message[] = (data.messages || []).map((m: any, i: number) => ({
          id: `loaded-${i}`,
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
        setMessages(loaded);
      } catch {
        if (!isMounted) return;
        toast.error("Failed to load chat");
        router.push("/workspace");
      } finally {
        if (isMounted) setIsLoadingChat(false);
      }
    };
    loadChat();
    return () => { isMounted = false; };
  }, [chatId]);

  // ── Load library papers ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedProject) return;
    const fetchLibrary = async () => {
      try {
        const res = await fetch(`${API}/projects/${selectedProject._id}/papers`, { headers: authHeaders() });
        if (res.ok) setLibraryPapers(await res.json());
      } catch { }
    };
    fetchLibrary();
  }, [selectedProject]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingStatus]);

  // ── Auto-send initial query (only once, after chat is loaded) ─────────────
  useEffect(() => {
    if (!isLoadingChat && initialQuery && messages.length === 0 && !hasSentInitialQuery.current) {
      hasSentInitialQuery.current = true;
      fetchStream(initialQuery);
    }
  }, [isLoadingChat, initialQuery]);

  // ── Save Q&A pair to backend ──────────────────────────────────────────────
  const saveToChatHistory = async (userMsg: string, assistantMsg: string) => {
    try {
      const res = await fetch(`${API}/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          messages: [
            { role: "user", content: userMsg },
            { role: "assistant", content: assistantMsg },
          ],
        }),
      });
      if (res.ok) {
        const updatedChat = await res.json();
        // If the backend generated an AI title, use it.
        if (updatedChat.title && updatedChat.title !== "New Chat" && chatTitle === "New Chat") {
          setChatTitle(updatedChat.title);
        }
        queryClient.invalidateQueries({ queryKey: ['chats', selectedProject?._id ?? null] });
      }
    } catch (e) {
      console.warn("Failed to persist chat messages:", e);
    }
  };

  // ── Streaming ─────────────────────────────────────────────────────────────
  const fetchStream = async (query: string) => {
    if (!query.trim()) return;

    setIsStreaming(true);
    setLoadingStatus("Initializing...");
    streamRef.current = true;
    setCurrentPapers([]);

    const userId = `u-${Date.now()}`;
    const assistantId = `a-${Date.now()}`;

    const historyPayload = messages.map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [
      ...prev,
      { id: userId, role: "user", content: query },
      { id: assistantId, role: "assistant", content: "" },
    ]);

    abortControllerRef.current = new AbortController();
    let finalAssistantContent = "";

    try {
      const res = await fetch(`${API}/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        },
        body: JSON.stringify({
          query,
          history: historyPayload,
          selected_paper_ids: Array.from(activeContextIds),
          project_id: selectedProject?._id || null,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error("Stream unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (streamRef.current) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === "status") setLoadingStatus(data.message);
            if (data.type === "papers") setCurrentPapers(data.data);
            if (data.type === "content") {
              finalAssistantContent += data.data;
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, content: m.content + data.data } : m)
              );
            }
          } catch (err) {
            console.error("Error parsing stream chunk:", err, line);
          }
        }
      }

      // Process any remaining characters in the buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.type === "status") setLoadingStatus(data.message);
          if (data.type === "papers") setCurrentPapers(data.data);
          if (data.type === "content") {
            finalAssistantContent += data.data;
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: m.content + data.data } : m)
            );
          }
        } catch (err) {
          console.error("Error parsing trailing buffer:", err, buffer);
        }
      }

      // Persist the exchange
      if (finalAssistantContent) {
        await saveToChatHistory(query, finalAssistantContent);
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        toast.success("Generation stopped");
        if (finalAssistantContent) await saveToChatHistory(query, finalAssistantContent);
      } else {
        toast.error("Streaming error");
      }
    } finally {
      setIsStreaming(false);
      setLoadingStatus("");
      streamRef.current = false;
    }
  };

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    const q = input;
    setInput("");
    fetchStream(q);
  };

  // ── Save paper helpers ────────────────────────────────────────────────────
  const handleSavePaper = async (paper: Paper) => {
    if (!selectedProject) { toast.error("No project selected"); return; }
    try {
      const payload = {
        title: paper.title,
        authors: Array.isArray(paper.authors) ? paper.authors : [paper.authors].filter(Boolean),
        abstract: paper.summary,
        pdf_url: paper.url,
        source: paper.source,
        publication_date: paper.published_date || null,
      };
      const res = await fetch(`${API}/projects/${selectedProject._id}/papers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Paper saved to library");
        setSavedPaperUrls(prev => new Set(prev).add(paper.url));
        setLibraryPapers(prev => [...prev, data]);
        setActiveContextIds(prev => new Set(prev).add(data._id || data.id));
        triggerPapersRefresh();
      } else { toast.error("Error saving paper"); }
    } catch { toast.error("Network error"); }
  };

  const handleBulkSave = async () => {
    if (!selectedProject) { toast.error("No project selected"); return; }
    setIsBulkSaving(true);
    try {
      const papersToSave = currentPapers.filter(p => selectedSearchPapers.has(p.url) && !savedPaperUrls.has(p.url));
      if (!papersToSave.length) { toast.info("No new papers to save."); return; }
      const res = await fetch(`${API}/projects/${selectedProject._id}/papers/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          papers: papersToSave.map(p => ({
            title: p.title,
            authors: Array.isArray(p.authors) ? p.authors : [p.authors].filter(Boolean),
            abstract: p.summary,
            pdf_url: p.url,
            source: p.source,
            publication_date: p.published_date || null,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${papersToSave.length} papers saved`);
        setSavedPaperUrls(prev => { const s = new Set(prev); papersToSave.forEach(p => s.add(p.url)); return s; });
        setSelectedSearchPapers(new Set());
        if (data.papers) {
          setLibraryPapers(prev => [...prev, ...data.papers]);
          setActiveContextIds(prev => { const s = new Set(prev); data.papers.forEach((p: any) => s.add(p._id || p.id)); return s; });
        }
        triggerPapersRefresh();
      } else { toast.error("Error saving papers"); }
    } catch { toast.error("Network error"); } finally { setIsBulkSaving(false); }
  };

  const handleDeleteChat = async () => {
    if (!confirm("Delete this chat? This cannot be undone.")) return;
    try {
      await fetch(`${API}/chats/${chatId}`, { method: "DELETE", headers: authHeaders() });
      queryClient.invalidateQueries({ queryKey: ['chats', selectedProject?._id ?? null] });
      router.push("/workspace");
    } catch { toast.error("Failed to delete chat"); }
  };

  const handleRenameChat = async () => {
    const newName = window.prompt("Enter new chat name:", chatTitle);
    if (!newName || newName.trim() === chatTitle) return;
    try {
      const res = await fetch(`${API}/chats/${chatId}/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ title: newName.trim() })
      });
      if (res.ok) {
        setChatTitle(newName.trim());
        queryClient.invalidateQueries({ queryKey: ['chats', selectedProject?._id ?? null] });
        toast.success("Chat renamed");
      } else {
        toast.error("Failed to rename chat");
      }
    } catch { toast.error("Network error renaming chat"); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoadingChat) {
    return (
      <div className="flex items-center justify-center flex-1">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden bg-background">
      {/* MAIN CHAT */}
      <div className="flex flex-col flex-1 h-full min-w-0">
        {/* Chat title bar */}
        <div className="border-b bg-card px-6 py-2 flex items-center gap-2">
          <span className="font-medium text-sm truncate flex-1">{chatTitle}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={handleRenameChat} title="Rename Chat">
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={handleDeleteChat} title="Delete Chat">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          <div className="max-w-3xl mx-auto space-y-8 pb-6">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  {msg.role === "assistant"
                    ? <Sparkles className="w-4 h-4 text-primary" />
                    : <User className="w-4 h-4" />}
                </div>
                <div className={`max-w-[85%] ${msg.role === "user" ? "bg-secondary/50 rounded-2xl rounded-tr-none px-4 py-2" : ""}`}>
                  {msg.content ? (
                    <div className="prose prose-sm dark:prose-invert">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {loadingStatus || "Thinking..."}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t bg-background p-4">
          <div className="max-w-3xl mx-auto relative">
            <Textarea
              value={input}
              disabled={isStreaming}
              onChange={e => setInput(e.target.value)}
              placeholder={isStreaming ? "AI generating..." : "Ask a follow-up question..."}
              className="min-h-[60px] pr-12 resize-none rounded-xl"
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
            />
            <Button
              size="icon"
              disabled={!input.trim() && !isStreaming}
              onClick={isStreaming ? () => abortControllerRef.current?.abort() : handleSend}
              className="absolute right-3 bottom-3"
              variant={isStreaming ? "destructive" : "default"}
            >
              {isStreaming ? <Square className="w-4 h-4 fill-current" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* SIDEBAR — Library Context + Search Results */}
      {(currentPapers.length > 0 || libraryPapers.length > 0) && (
        <div className="w-80 border-l bg-card flex flex-col flex-shrink-0">
          {/* Library context checkboxes */}
          {libraryPapers.length > 0 && (
            <div className="flex-1 flex flex-col border-b overflow-hidden min-h-[30vh]">
              <div className="p-4 border-b font-medium flex items-center justify-between">
                <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Library Context</div>
                <div className="text-xs px-2 py-0.5 rounded-full bg-secondary">{activeContextIds.size} Active</div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {libraryPapers.map(p => (
                  <div key={p._id || p.id} className={`flex items-start gap-2 border rounded p-3 transition-colors ${activeContextIds.has(p._id || p.id) ? "bg-primary/5 border-primary" : ""}`}>
                    <input type="checkbox" className="mt-1" checked={activeContextIds.has(p._id || p.id)}
                      onChange={e => {
                        const s = new Set(activeContextIds);
                        e.target.checked ? s.add(p._id || p.id) : s.delete(p._id || p.id);
                        setActiveContextIds(s);
                      }} />
                    <div className="text-xs font-medium line-clamp-2">{p.title}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search result papers */}
          {currentPapers.length > 0 && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-[40vh]">
              <div className="p-4 border-b font-medium flex items-center justify-between">
                <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Sources ({currentPapers.length})</div>
                <Button size="sm" onClick={handleBulkSave} disabled={isBulkSaving || selectedSearchPapers.size === 0} className="h-7 text-xs">
                  {isBulkSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                  {isBulkSaving ? "Saving..." : `Save (${selectedSearchPapers.size})`}
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {currentPapers.map((paper, i) => (
                  <div key={i} className={`border rounded-lg p-3 text-sm flex gap-3 ${selectedSearchPapers.has(paper.url) ? "bg-secondary/20 border-secondary" : ""}`}>
                    <input type="checkbox" className="rounded mt-0.5 accent-primary" checked={selectedSearchPapers.has(paper.url)}
                      onChange={e => {
                        const s = new Set(selectedSearchPapers);
                        e.target.checked ? s.add(paper.url) : s.delete(paper.url);
                        setSelectedSearchPapers(s);
                      }} />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium line-clamp-2 mb-1 text-xs">{paper.title}</h4>
                      <p className="text-xs text-muted-foreground mb-1">
                        {Array.isArray(paper.authors) ? paper.authors.slice(0, 2).join(", ") : String(paper.authors || "")} · {paper.published_date ? new Date(paper.published_date).getFullYear() : ""}
                      </p>
                      {paper.summary && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2 border-l-2 pl-2">{paper.summary}</p>
                      )}
                      <div className="flex justify-between pt-1 border-t">
                        <a href={paper.url} target="_blank" className="text-primary text-xs flex gap-1 items-center">
                          <ExternalLink className="w-3 h-3" /> PDF
                        </a>
                        <Button size="sm" variant={savedPaperUrls.has(paper.url) ? "outline" : "secondary"}
                          disabled={savedPaperUrls.has(paper.url) || !selectedProject}
                          onClick={() => handleSavePaper(paper)} className="h-6 text-xs px-2">
                          {savedPaperUrls.has(paper.url) ? <><Check className="w-3 h-3 mr-1" />Saved</> : <><Plus className="w-3 h-3 mr-1" />Save</>}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center flex-1"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
      <ChatSession />
    </Suspense>
  );
}
