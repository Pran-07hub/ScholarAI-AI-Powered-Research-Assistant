"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useProject } from "@/context/ProjectContext";
import { toast } from "sonner";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SUGGESTIONS = [
  "Impact of AI on climate change",
  "CRISPR gene editing ethics",
  "Quantum computing in cybersecurity",
  "Microplastics in marine ecosystems",
];

function WorkspaceLanding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const { selectedProject } = useProject();

  const [input, setInput] = useState(initialQuery);
  const [isCreating, setIsCreating] = useState(false);

  const startChat = async (query: string) => {
    if (!query.trim() || isCreating) return;
    setIsCreating(true);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/chats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          project_id: selectedProject?._id || null,
          title: query.slice(0, 70).trim(),
        }),
      });

      if (!res.ok) throw new Error("Failed to create chat");

      const data = await res.json();
      const chatId = data._id || data.id;
      // Redirect to the persistent chat page with the initial query
      router.push(`/chat/${chatId}?q=${encodeURIComponent(query.trim())}`);
    } catch (e) {
      console.error(e);
      toast.error("Could not start chat. Are you signed in?");
      setIsCreating(false);
    }
  };

  // Auto-start if launched with ?q= from landing page
  useEffect(() => {
    if (initialQuery) startChat(initialQuery);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center text-center space-y-4 w-full max-w-xl">
        <Sparkles className="w-10 h-10 text-primary" />
        <h2 className="text-2xl font-semibold">What would you like to research?</h2>
        <p className="text-sm text-muted-foreground">
          {selectedProject
            ? `Researching in project: ${selectedProject.name}`
            : "Select a project from the top bar to auto-load your library as context"}
        </p>

        <div className="w-full mt-4">
          <div className="relative">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={isCreating}
              placeholder="Ask a research question…"
              className="min-h-[60px] pr-14 resize-none rounded-xl border-muted-foreground/20 shadow-sm"
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); startChat(input); }
              }}
            />
            <Button
              size="icon"
              disabled={!input.trim() || isCreating}
              onClick={() => startChat(input)}
              className="absolute right-3 bottom-3"
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 w-full">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => startChat(s)}
              disabled={isCreating}
              className="text-sm p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors text-left disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
      <WorkspaceLanding />
    </Suspense>
  );
}
