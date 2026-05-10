"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  ExternalLink,
  AlertCircle,
  Loader2,
  ArrowLeft,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Paper {
  _id: string;
  title: string;
  authors: string[];
  abstract?: string;
  publication_date?: string;
  venue?: string;
  pdf_url?: string;
  source: string;
  full_text_status?: string;
}

function ReaderContent() {
  const searchParams = useSearchParams();
  const paperId = searchParams.get("paperId");
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullTextStatus, setFullTextStatus] = useState<string>("none");

  useEffect(() => {
    if (!paperId) return;
    const fetchPaper = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API}/papers/${paperId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Paper not found");
        const data = await res.json();
        setPaper(data);
        const status = data.full_text_status || "none";
        setFullTextStatus(status);
        if (status !== "available") {
          // Auto-fetch full text in the background — reader implies deep reading
          fetch(`${API}/papers/${paperId}/fetch-full-text`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.status) setFullTextStatus(d.status); })
            .catch(() => {/* silently ignore */});
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPaper();
  }, [paperId]);

  if (!paperId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
        <BookOpen className="w-12 h-12 opacity-20" />
        <p className="font-medium">No paper selected</p>
        <p className="text-sm">Navigate here from the Papers library.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-sm">Loading paper…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm max-w-md">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  if (!paper) return null;

  const year = paper.publication_date
    ? new Date(paper.publication_date).getFullYear()
    : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* PDF Viewer pane */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="border-b border-border bg-card px-4 py-2 flex items-center gap-3 flex-shrink-0">
          <Link href="/workspace/papers">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              Papers
            </Button>
          </Link>
          <span className="text-sm font-medium truncate flex-1">{paper.title}</span>
          {paper.pdf_url && (
            <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5" />
                Open PDF
              </Button>
            </a>
          )}
        </div>

        {/* PDF iframe or no-PDF message */}
        {paper.pdf_url ? (
          <iframe
            src={paper.pdf_url}
            className="flex-1 w-full border-0"
            title={paper.title}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground gap-3 p-8">
            <BookOpen className="w-12 h-12 opacity-20" />
            <p className="font-medium">No PDF available</p>
            <p className="text-sm max-w-sm">
              This paper doesn't have a PDF URL. Import it via DOI/arXiv to get a direct PDF link, or use the external link button to open it in your browser.
            </p>
          </div>
        )}
      </div>

      {/* Metadata sidebar */}
      <aside className="w-72 flex-shrink-0 border-l border-border bg-card flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Paper Details
            </span>
          </div>
        </div>

        <div className="p-4 space-y-4 flex-1">
          {/* Title */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Title</p>
            <p className="text-sm font-medium leading-snug">{paper.title}</p>
          </div>

          {/* Authors */}
          {paper.authors && paper.authors.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Authors</p>
              <p className="text-sm">{paper.authors.join(", ")}</p>
            </div>
          )}

          {/* Year / Venue */}
          <div className="flex gap-4">
            {year && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Year</p>
                <p className="text-sm">{year}</p>
              </div>
            )}
            {paper.venue && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Venue</p>
                <p className="text-sm">{paper.venue}</p>
              </div>
            )}
          </div>

          {/* Abstract */}
          {paper.abstract && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Abstract</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{paper.abstract}</p>
            </div>
          )}

          {/* Full text status */}
          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-3 h-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Full text</p>
            </div>
            {fullTextStatus === "available" ? (
              <p className="text-xs text-green-600">Indexed for chat</p>
            ) : fullTextStatus === "unavailable" ? (
              <p className="text-xs text-muted-foreground">Not available</p>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Fetching…
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    }>
      <ReaderContent />
    </Suspense>
  );
}
