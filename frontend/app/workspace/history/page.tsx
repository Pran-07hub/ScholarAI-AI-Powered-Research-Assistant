"use client";

import { useState } from "react";
import { Clock, MessageSquare, Loader2, Trash2, AlertCircle, Edit2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useProject } from "@/context/ProjectContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Chat {
  _id: string;
  title: string;
  messages: { role: string; content: string; created_at: string }[];
  created_at: string;
  updated_at: string;
}

function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function groupByDate(chats: Chat[]) {
  const today: Chat[] = [];
  const earlier: Chat[] = [];
  const cutoff = Date.now() - 86_400_000;
  for (const c of chats) {
    const d = new Date(c.updated_at.endsWith("Z") ? c.updated_at : c.updated_at + "Z");
    (d.getTime() > cutoff ? today : earlier).push(c);
  }
  return { today, earlier };
}

export default function History() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedProject } = useProject();
  const projectId = selectedProject?._id ?? null;

  const { data: chats = [], isLoading: loading, error: fetchError } = useQuery({
    queryKey: ['chats', projectId],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Sign in to view history");
      const url = projectId ? `${API}/chats?project_id=${projectId}` : `${API}/chats`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load chat history");
      return res.json();
    },
    enabled: !!projectId,
  });

  const error = fetchError ? fetchError.message : null;

  const handleDelete = async (chatId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API}/chats/${chatId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      queryClient.setQueryData(['chats', projectId], (old: Chat[] = []) => old.filter(c => c._id !== chatId));
      toast.success("Chat deleted");
    } catch { toast.error("Failed to delete chat"); }
  };

  const handleRename = async (chat: Chat, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newName = window.prompt("Enter new chat name:", chat.title || "Untitled Chat");
    if (!newName || newName.trim() === chat.title) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/chats/${chat._id}/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newName.trim() })
      });
      if (res.ok) {
        queryClient.setQueryData(['chats', projectId], (old: Chat[] = []) => old.map(c => c._id === chat._id ? { ...c, title: newName.trim() } : c));
        toast.success("Chat renamed");
      } else {
        toast.error("Failed to rename chat");
      }
    } catch { toast.error("Error renaming chat"); }
  };

  const { today, earlier } = groupByDate(chats);

  const renderChat = (chat: Chat) => (
    <Link
      key={chat._id}
      href={`/chat/${chat._id}`}
      className="group flex items-center gap-4 px-4 py-3 hover:bg-secondary/50 rounded-lg transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
        <MessageSquare className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm line-clamp-1">{chat.title || "Untitled Chat"}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {chat.messages.length} message{chat.messages.length !== 1 ? "s" : ""}
          {chat.messages.length > 0 && (
            <> · <span className="line-clamp-1 inline">{chat.messages[chat.messages.length - 1]?.content?.slice(0, 60)}</span></>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-muted-foreground">{formatRelativeTime(chat.updated_at)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
          onClick={e => handleRename(chat, e)}
          title="Rename Chat"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
          onClick={e => handleDelete(chat._id, e)}
          title="Delete Chat"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Link>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card p-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Chat History</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedProject
              ? `Conversations in "${selectedProject.name}"`
              : "Select a project to see its chat history"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/workspace")}>
          + New Chat
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && chats.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <MessageSquare className="w-12 h-12 opacity-20 mb-3" />
              <p className="font-medium">No chat history yet</p>
              <p className="text-sm mt-1">Start a new conversation from the Search page.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push("/workspace")}>
                Start a Chat
              </Button>
            </div>
          )}

          {today.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-2 px-4">Today</h2>
              <div className="space-y-1">{today.map(renderChat)}</div>
            </div>
          )}

          {earlier.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-2 px-4">Earlier</h2>
              <div className="space-y-1">{earlier.map(renderChat)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
