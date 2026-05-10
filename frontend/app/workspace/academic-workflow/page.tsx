"use client";

import { useState, useEffect } from "react";
import {
  GraduationCap,
  FileText,
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

type Tab = "grant" | "thesis" | "rebuttal";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function StreamingOutput({
  value,
  loading,
  placeholder,
}: {
  value: string;
  loading: boolean;
  placeholder: string;
}) {
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
          <span className="font-medium">AI-Generated Output</span>
        </div>
      )}
      <div className="text-sm leading-relaxed whitespace-pre-wrap font-serif text-foreground">
        {value}
        {loading && <span className="animate-pulse">▌</span>}
      </div>
    </div>
  );
}

export default function AcademicWorkflowPage() {
  const { selectedProject } = useProject();
  const [tab, setTab] = useState<Tab>("grant");

  // Grant
  const [grantContext, setGrantContext] = useState("");
  const [grantOutput, setGrantOutput] = useState("");
  const [loadingGrant, setLoadingGrant] = useState(false);

  // Thesis
  const [thesisType, setThesisType] = useState("PhD");
  const [thesisOutput, setThesisOutput] = useState("");
  const [loadingThesis, setLoadingThesis] = useState(false);

  // Rebuttal
  const [reviewerComments, setReviewerComments] = useState("");
  const [rebuttalOutput, setRebuttalOutput] = useState("");
  const [loadingRebuttal, setLoadingRebuttal] = useState(false);

  useEffect(() => {
    setGrantOutput("");
    setThesisOutput("");
    setRebuttalOutput("");
  }, [selectedProject]);

  const streamTo = async (
    url: string,
    body: object,
    setter: (v: string | ((p: string) => string)) => void,
    setLoading: (v: boolean) => void
  ) => {
    setLoading(true);
    setter("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setter((prev) => prev + decoder.decode(value));
      }
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  if (!selectedProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No project selected</p>
          <p className="text-sm mt-1">Select a project to use academic writing tools.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <GraduationCap className="w-5 h-5 text-primary" />
          <div>
            <h1 className="font-semibold text-lg">Academic Workflow</h1>
            <p className="text-xs text-muted-foreground">
              AI-powered tools for grants, theses, and review responses ·{" "}
              <span className="font-medium text-foreground">{selectedProject.name}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 border-b border-border -mb-4">
          {([
            { id: "grant", label: "Grant Writing", icon: FileText },
            { id: "thesis", label: "Thesis Outline", icon: GraduationCap },
            { id: "rebuttal", label: "Rebuttal Helper", icon: MessageSquareWarning },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
                tab === id
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">

        {/* ── Grant Writing ────────────────────────────────────────── */}
        {tab === "grant" && (
          <div className="max-w-3xl space-y-4">
            <div>
              <h2 className="font-semibold mb-1">Grant Literature Review</h2>
              <p className="text-xs text-muted-foreground">
                Generates a Background + Significance section structured for grant proposals.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Grant context <span className="font-normal">(optional — e.g. "NIH R01 on cancer genomics")</span>
              </label>
              <textarea
                value={grantContext}
                onChange={(e) => setGrantContext(e.target.value)}
                placeholder="Describe the grant type, funding body, or specific aims…"
                rows={2}
                className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
            <div className="flex gap-2">
              {grantOutput && <CopyButton text={grantOutput} />}
              <Button
                onClick={() =>
                  streamTo(
                    `${API_BASE}/academic-workflow/grant/${selectedProject._id}`,
                    { grant_context: grantContext },
                    setGrantOutput,
                    setLoadingGrant
                  )
                }
                disabled={loadingGrant}
                size="sm"
              >
                {loadingGrant ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : grantOutput ? <RefreshCw className="w-4 h-4 mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {loadingGrant ? "Generating…" : grantOutput ? "Regenerate" : "Generate"}
              </Button>
            </div>
            <StreamingOutput
              value={grantOutput}
              loading={loadingGrant}
              placeholder="Click Generate to draft a grant literature review from your project papers."
            />
          </div>
        )}

        {/* ── Thesis Outline ───────────────────────────────────────── */}
        {tab === "thesis" && (
          <div className="max-w-3xl space-y-4">
            <div>
              <h2 className="font-semibold mb-1">Thesis Outline Generator</h2>
              <p className="text-xs text-muted-foreground">
                Structures your paper collection into a thesis chapter outline.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Thesis level
              </label>
              <div className="flex gap-2">
                {["PhD", "Masters", "Undergraduate"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setThesisType(t)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      thesisType === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              {thesisOutput && <CopyButton text={thesisOutput} />}
              <Button
                onClick={() =>
                  streamTo(
                    `${API_BASE}/academic-workflow/thesis/${selectedProject._id}`,
                    { thesis_type: thesisType },
                    setThesisOutput,
                    setLoadingThesis
                  )
                }
                disabled={loadingThesis}
                size="sm"
              >
                {loadingThesis ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : thesisOutput ? <RefreshCw className="w-4 h-4 mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {loadingThesis ? "Generating…" : thesisOutput ? "Regenerate" : "Generate Outline"}
              </Button>
            </div>
            <StreamingOutput
              value={thesisOutput}
              loading={loadingThesis}
              placeholder="Click Generate Outline to structure your papers into a thesis chapter plan."
            />
          </div>
        )}

        {/* ── Rebuttal Helper ──────────────────────────────────────── */}
        {tab === "rebuttal" && (
          <div className="max-w-3xl space-y-4">
            <div>
              <h2 className="font-semibold mb-1">Rebuttal Helper</h2>
              <p className="text-xs text-muted-foreground">
                Paste reviewer comments — AI drafts a point-by-point rebuttal using your project papers as evidence.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Reviewer comments <span className="text-destructive">*</span>
              </label>
              <textarea
                value={reviewerComments}
                onChange={(e) => setReviewerComments(e.target.value)}
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
              <Button
                onClick={() => {
                  if (!reviewerComments.trim()) return toast.error("Paste reviewer comments first");
                  streamTo(
                    `${API_BASE}/academic-workflow/rebuttal/${selectedProject._id}`,
                    { reviewer_comments: reviewerComments },
                    setRebuttalOutput,
                    setLoadingRebuttal
                  );
                }}
                disabled={loadingRebuttal}
                size="sm"
              >
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
        )}
      </div>
    </div>
  );
}
