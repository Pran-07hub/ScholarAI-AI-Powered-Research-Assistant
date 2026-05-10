"use client";

import { useState, Suspense, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  Filter,
  Upload,
  Sparkles,
  X,
  MessageSquare,
  Trash2,
  Loader2,
  FileUp,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";
import { Paper } from "@/types/api";
import { PaperDetailPanel } from "@/components/papers/PaperDetailPanel";
import { toast } from "sonner";

type SortField = "year";

function PapersContent() {
  const { selectedProject, triggerPapersRefresh } = useProject();
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") || "";
  const [searchInput, setSearchInput] = useState(query);
  const [sortField, setSortField] = useState<SortField>("year");
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);

  const getPaperYear = (p: Paper) =>
    p.publication_date ? new Date(p.publication_date).getFullYear() : null;
  const [selectedPapers, setSelectedPapers] = useState<Set<string>>(new Set());

  const [dbPapers, setDbPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Staged filter state (UI inputs before Apply)
  const [showFilters, setShowFilters] = useState(false);
  const [pendingYearFrom, setPendingYearFrom] = useState<string>("");
  const [pendingYearTo, setPendingYearTo] = useState<string>("");
  const [pendingSources, setPendingSources] = useState<Set<string>>(new Set());

  // Applied filter state (used for actual filtering)
  const [filterYearFrom, setFilterYearFrom] = useState<string>("");
  const [filterYearTo, setFilterYearTo] = useState<string>("");
  const [filterSources, setFilterSources] = useState<Set<string>>(new Set());

  const fetchPapers = async () => {
    if (!selectedProject) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/projects/${selectedProject._id}/papers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDbPapers(data as Paper[]);
      }
    } catch (err) {
      console.error("Failed to fetch library", err);
    } finally {
      setLoading(false);
    }
  };

  const selectedIdParam = searchParams.get("selected");

  useEffect(() => {
    fetchPapers();
  }, [selectedProject]);

  // Auto-select paper from URL param after papers load
  useEffect(() => {
    if (selectedIdParam && dbPapers.length > 0) {
      const found = dbPapers.find((p) => p._id === selectedIdParam);
      if (found) setSelectedPaper(found);
    }
  }, [selectedIdParam, dbPapers]);

  // Collect unique sources for the filter UI
  const availableSources = Array.from(new Set(dbPapers.map(p => p.source).filter(Boolean)));

  const currentPapers = dbPapers.filter(p => {
    if (!p.title.toLowerCase().includes(searchInput.toLowerCase())) return false;
    const year = getPaperYear(p);
    if (filterYearFrom && year !== null && year < parseInt(filterYearFrom)) return false;
    if (filterYearTo && year !== null && year > parseInt(filterYearTo)) return false;
    if (filterSources.size > 0 && !filterSources.has(p.source)) return false;
    return true;
  });

  const activeFilterCount = (filterYearFrom ? 1 : 0) + (filterYearTo ? 1 : 0) + filterSources.size;

  const applyFilters = () => {
    setFilterYearFrom(pendingYearFrom);
    setFilterYearTo(pendingYearTo);
    setFilterSources(new Set(pendingSources));
    setShowFilters(false);
  };

  const clearFilters = () => {
    setPendingYearFrom("");
    setPendingYearTo("");
    setPendingSources(new Set());
    setFilterYearFrom("");
    setFilterYearTo("");
    setFilterSources(new Set());
    setShowFilters(false);
  };

  const sortedPapers = [...currentPapers].sort((a, b) => {
    const ay = getPaperYear(a) ?? 0;
    const by = getPaperYear(b) ?? 0;
    return by - ay;
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      router.push(`/workspace/papers?q=${encodeURIComponent(searchInput)}`);
    }
  };

  const togglePaperSelection = (paperId: string) => {
    setSelectedPapers(prev => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  };

  const handleDeletePapers = async () => {
    if (selectedPapers.size === 0 || !selectedProject) return;
    
    const confirmDelete = window.confirm(`Are you sure you want to delete ${selectedPapers.size} paper(s)? This action cannot be undone.`);
    if (!confirmDelete) return;

    setIsDeleting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/projects/${selectedProject._id}/papers/bulk`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ paper_ids: Array.from(selectedPapers) })
      });
      if (res.ok) {
        setSelectedPapers(new Set());
        fetchPapers();
        triggerPapersRefresh();
      } else {
        const errorData = await res.json();
        alert(errorData.detail || "Failed to delete papers");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while deleting papers");
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedProject) {
      toast.error("No project selected");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are supported");
      return;
    }

    setIsUploading(true);
    setUploadProgress("Uploading PDF…");

    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("file", file);

      setUploadProgress("Extracting text and analysing with AI…");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/projects/${selectedProject._id}/papers/upload-pdf`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (res.ok) {
        toast.success("PDF ingested and added to your library");
        await fetchPapers();
        triggerPapersRefresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.detail || "Failed to upload PDF");
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error during PDF upload");
    } finally {
      setIsUploading(false);
      setUploadProgress("");
      // Reset file input so the same file can be re-uploaded if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="h-full flex">
      {/* Hidden file input for PDF upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handlePdfUpload}
      />

      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${selectedPaper ? "mr-96" : ""}`}>
        {/* Search and Filters Bar */}
        <div className="border-b border-border bg-card p-4 relative">
          <div className="flex items-center gap-4 mb-4">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Refine your search..."
                  className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </form>
            <Button 
                variant="destructive" 
                size="sm" 
                onClick={handleDeletePapers} 
                disabled={selectedPapers.size === 0 || isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white"
            >
                <Trash2 className="w-4 h-4 mr-2" />
                {isDeleting ? "Deleting..." : `Delete ${selectedPapers.size > 0 ? `(${selectedPapers.size})` : ""}`}
            </Button>
            <Button
              variant={activeFilterCount > 0 ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showFilters ? "rotate-180" : ""}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || !selectedProject}
              title={!selectedProject ? "Select a project first" : "Upload a PDF"}
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileUp className="w-4 h-4 mr-2" />
              )}
              {isUploading ? "Uploading…" : "Upload PDF"}
            </Button>
          </div>

          {isUploading && uploadProgress && (
            <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              {uploadProgress}
            </div>
          )}

          {/* Filter Panel - floats above content */}
          {showFilters && (
            <div className="absolute top-full left-0 right-0 z-20 border-b border-x border-border bg-card shadow-lg rounded-b-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Filter Papers</span>
                <span className="text-xs text-muted-foreground">
                  {currentPapers.length} of {dbPapers.length} papers
                </span>
              </div>

              {/* Year Range */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                  Year Range
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="From year"
                    value={pendingYearFrom}
                    onChange={e => setPendingYearFrom(e.target.value)}
                    className="w-28 px-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    min="1900"
                    max="2100"
                  />
                  <span className="text-muted-foreground text-sm">—</span>
                  <input
                    type="number"
                    placeholder="To year"
                    value={pendingYearTo}
                    onChange={e => setPendingYearTo(e.target.value)}
                    className="w-28 px-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    min="1900"
                    max="2100"
                  />
                  <div className="flex gap-1 ml-2">
                    {[5, 10].map(n => (
                      <button
                        key={n}
                        onClick={() => { setPendingYearFrom(String(new Date().getFullYear() - n)); setPendingYearTo(""); }}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-secondary transition-colors"
                      >
                        Last {n}y
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Source Filter */}
              {availableSources.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                    Source
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableSources.map(source => (
                      <button
                        key={source}
                        onClick={() => setPendingSources(prev => {
                          const next = new Set(prev);
                          if (next.has(source)) next.delete(source);
                          else next.add(source);
                          return next;
                        })}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors capitalize ${
                          pendingSources.has(source)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        {source}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Apply / Clear buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <button
                  onClick={clearFilters}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <X className="w-3 h-3" /> Clear all
                </button>
                <Button size="sm" onClick={applyFilters}>
                  Apply Filters
                </Button>
              </div>
            </div>
          )}

          {query && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Results for:</span>
              <Badge variant="secondary" className="font-normal">
                "{query}"
                <button
                  onClick={() => router.push("/workspace/papers")}
                  className="ml-2 hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
              <span className="text-sm text-muted-foreground ml-2">
                {currentPapers.length} papers found
              </span>
              <div className="flex-1" />
              <div className="flex items-center gap-2">
                <span className="ai-badge">
                  <Sparkles className="w-3 h-3" />
                  AI Summarized
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-max">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-table-header border-b border-border">
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPapers(new Set(currentPapers.map((p) => p._id)));
                      } else {
                        setSelectedPapers(new Set());
                      }
                    }}
                    checked={currentPapers.length > 0 && selectedPapers.size === currentPapers.length}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Paper
                </th>
                <th className="bg-table-header border-b border-border px-4 py-3 text-left font-medium text-muted-foreground w-[120px]">
                  Year
                  <button className="ml-1 hover:text-foreground">↓</button>
                </th>
                <th className="bg-table-header border-b border-border px-4 py-3 text-left font-medium text-muted-foreground w-[150px]">
                  Source
                </th>
                <th className="bg-table-header border-b border-border px-4 py-3 text-left font-medium text-muted-foreground">
                  Methodology
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  AI Summary
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-[80px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPapers.map((paper) => (
                <tr
                  key={paper._id}
                  className={`border-b border-border hover:bg-table-hover cursor-pointer transition-colors ${selectedPaper?._id === paper._id ? "bg-secondary/50" : ""
                    }`}
                  onClick={() => setSelectedPaper(paper)}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={selectedPapers.has(paper._id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        togglePaperSelection(paper._id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-4 py-3 max-w-md">
                    <div className="font-medium text-foreground line-clamp-1 mb-1">
                      {paper.title}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {paper.authors.join(", ")}{paper.venue ? ` · ${paper.venue}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="text-sm text-muted-foreground">
                      {getPaperYear(paper) ?? "—"}
                    </div>
                  </td>
                  <td className="border-b border-border px-4 py-3">
                    <Badge variant="outline" className="font-normal capitalize">
                      {paper.source}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {paper.extracted_data?.methodology || paper.extracted_data?.study_type || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {paper.abstract || "No abstract available."}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/workspace?clipped=${paper._id}`);
                      }}
                    >
                      <MessageSquare className="w-3 h-3 mr-1" />
                      Chat
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedPaper && (
        <PaperDetailPanel
          paper={selectedPaper}
          onClose={() => setSelectedPaper(null)}
        />
      )}
    </div>
  );
}

export default function Papers() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PapersContent />
    </Suspense>
  );
}