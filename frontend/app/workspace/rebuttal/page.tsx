"use client";

import { useState, useEffect } from "react";
import {
  MessageSquareWarning,
  Loader2,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/context/ProjectContext";
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
      {copied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function StreamingOutput({ value, loading, placeholder }: { value: string; loading: boolean; placeholder: string; }) {
  if (!value && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-xl text-muted-foreground text-center">
        <Sparkles className="w-10 h-10 opacity-20 mb-3" />
        <p className="text-sm">{placeholder}</p>
      </div>
    );
  }
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      {value && (
        <div className="flex items-center gap-1.5 text-xs text-primary mb-3">
          <Sparkles className="w-3 h-3" />
          <span className="font-medium">AI-Generated Rebuttal</span>
        </div>
      )}
      <div className="text-sm leading-relaxed whitespace-pre-wrap font-serif text-foreground">
        {value}
        {loading && <span className="animate-pulse">▌</span>}
      </div>
    </div>
  );
}

export default function RebuttalPage() {
  const { selectedProject } = useProject();
  const [reviewerComments, setReviewerComments] = useState("");
  const [rebuttalOutput, setRebuttalOutput] = useState("");
  const [loadingRebuttal, setLoadingRebuttal] = useState(false);

  useEffect(() => { setRebuttalOutput(""); }, [selectedProject]);

  const streamRebuttal = async () => {
    if (!selectedProject) return;
    if (!reviewerComments.trim()) return toast.error("Paste reviewer comments first");
    setLoadingRebuttal(true);
    setRebuttalOutput("");
    try {
      const res = await fetch(`${API_BASE}/academic-workflow/rebuttal/${selectedProject._id}`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ reviewer_comments: reviewerComments }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setRebuttalOutput(prev => prev + decoder.decode(value));
      }
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setLoadingRebuttal(false);
    }
  };

  if (!selectedProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <MessageSquareWarning className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No project selected</p>
          <p className="text-sm mt-1">Select a project to use the Rebuttal Helper.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <MessageSquareWarning className="w-5 h-5 text-primary" />
          <div>
            <h1 className="font-semibold text-lg">Rebuttal Helper</h1>
            <p className="text-xs text-muted-foreground">
              Drafts a point-by-point rebuttal using your project papers as evidence ·{" "}
              <span className="font-medium text-foreground">{selectedProject.name}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Reviewer comments <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reviewerComments}
              onChange={e => setReviewerComments(e.target.value)}
              placeholder="Paste the reviewer's comments here (each concern on a new line or numbered)…"
              rows={6}
              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
            />
          </div>

          {!reviewerComments.trim() && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5" />
              Reviewer comments are required
            </div>
          )}

          <div className="flex gap-2">
            {rebuttalOutput && <CopyButton text={rebuttalOutput} />}
            <Button onClick={streamRebuttal} disabled={loadingRebuttal || !reviewerComments.trim()} size="sm">
              {loadingRebuttal ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : rebuttalOutput ? <RefreshCw className="w-4 h-4 mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {loadingRebuttal ? "Writing rebuttal…" : rebuttalOutput ? "Regenerate" : "Generate Rebuttal"}
            </Button>
          </div>

          <StreamingOutput
            value={rebuttalOutput}
            loading={loadingRebuttal}
            placeholder="Paste reviewer comments above, then click Generate Rebuttal."
          />
        </div>
      </div>
    </div>
  );
}
