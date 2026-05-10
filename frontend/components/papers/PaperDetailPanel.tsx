"use client";

import { X, ExternalLink, Sparkles, Copy, BookOpen, Quote, Calendar, User, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Paper } from "@/types/api";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PaperDetailPanelProps {
  paper: Paper;
  onClose: () => void;
}

export function PaperDetailPanel({ paper, onClose }: PaperDetailPanelProps) {
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [fullTextStatus, setFullTextStatus] = useState<string>(paper.full_text_status || "none");
  const [loadingFullText, setLoadingFullText] = useState(false);

  const year = paper.publication_date
    ? new Date(paper.publication_date).getFullYear()
    : null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied!"));
  };

  const handleGenerateSummary = async () => {
    if (!paper.abstract) {
      toast.error("No abstract available to summarise.");
      return;
    }
    setLoadingSummary(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/writing-tools/summarize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text: paper.abstract, style: "concise" }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data.result || data.summary || data.rewritten_text || "");
      } else {
        toast.error("Failed to generate summary.");
      }
    } catch {
      toast.error("Error generating summary.");
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleLoadFullText = async () => {
    setLoadingFullText(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/papers/${paper._id}/fetch-full-text`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFullTextStatus(data.status);
        if (data.status === "available") {
          toast.success("Full text loaded and indexed for chat.");
        } else {
          toast.info("Full text not available for this paper.");
        }
      } else {
        toast.error("Failed to fetch full text.");
      }
    } catch {
      toast.error("Error fetching full text.");
    } finally {
      setLoadingFullText(false);
    }
  };

  return (
    <div className="fixed right-0 top-14 bottom-0 w-96 bg-card border-l border-border overflow-auto z-20">
      {/* Header */}
      <div className="sticky top-0 bg-card border-b border-border p-4 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Badge variant="secondary" className="mb-2 text-xs">
            {paper.source}
          </Badge>
          <h2 className="font-semibold text-foreground leading-tight line-clamp-3">
            {paper.title}
          </h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 -mt-1 -mr-2 flex-shrink-0">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Metadata */}
        <div className="space-y-3">
          {paper.authors.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <User className="w-3 h-3 text-muted-foreground" />
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Authors
                </label>
              </div>
              <p className="text-sm">{paper.authors.join(", ")}</p>
            </div>
          )}

          <div className="flex gap-6">
            {year && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Year
                  </label>
                </div>
                <p className="text-sm font-mono">{year}</p>
              </div>
            )}
            {paper.venue && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Venue
                </label>
                <p className="text-sm mt-1">{paper.venue}</p>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* AI Summary */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                AI Summary
              </label>
            </div>
            {!aiSummary && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={handleGenerateSummary}
                disabled={loadingSummary}
              >
                {loadingSummary ? "Generating..." : "Generate"}
              </Button>
            )}
          </div>
          {aiSummary ? (
            <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
              <p className="text-sm leading-relaxed">{aiSummary}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Click &quot;Generate&quot; to get an AI summary of this paper.
            </p>
          )}
        </div>

        {/* Abstract */}
        {paper.abstract && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Abstract
              </label>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {paper.abstract}
            </p>
          </div>
        )}

        {/* Full Paper */}
        <Separator />
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Full Paper
              </label>
            </div>
            {fullTextStatus === "available" ? (
              <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 border border-green-500/20">
                Full text loaded
              </Badge>
            ) : fullTextStatus === "unavailable" ? (
              <Badge variant="secondary" className="text-xs">
                Unavailable
              </Badge>
            ) : fullTextStatus === "fetching" ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading…
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={handleLoadFullText}
                disabled={loadingFullText}
              >
                {loadingFullText ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                  </span>
                ) : (
                  "Load Full Paper"
                )}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {fullTextStatus === "available"
              ? "Full text indexed — chat will use the complete paper content."
              : fullTextStatus === "unavailable"
              ? "Full text not available (gated or unsupported source)."
              : "Load full text to improve chat answers and enable deep reading."}
          </p>
        </div>

        {/* Extracted Data */}
        {paper.extracted_data && Object.keys(paper.extracted_data).length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Quote className="w-4 h-4 text-muted-foreground" />
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Extracted Fields
                </label>
              </div>
              <div className="space-y-2">
                {Object.entries(paper.extracted_data).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start gap-2 text-sm bg-secondary/50 rounded-lg px-3 py-2"
                  >
                    <span className="font-medium text-muted-foreground capitalize min-w-24">
                      {key.replace(/_/g, " ")}:
                    </span>
                    <span>{value as string}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex gap-2">
            {paper.pdf_url && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.open(paper.pdf_url!, "_blank")}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View PDF
              </Button>
            )}
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleCopy(paper.title)}
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Title
            </Button>
          </div>
          {paper.pdf_url && (
            <Link href={`/workspace/reader?paperId=${paper._id}`} className="w-full">
              <Button variant="secondary" className="w-full">
                <BookOpen className="w-4 h-4 mr-2" />
                Open in Reader
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
