"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CalendarDays,
  ExternalLink,
  Loader2,
  Search,
  RefreshCw,
  BookmarkPlus,
  BookmarkCheck,
  Clock,
  MapPin,
  AlertCircle,
  Calendar,
  Tag,
  Filter,
  X,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Conference {
  name: string;
  acronym: string;
  topics: string[];
  submission_deadline: string | null;
  notification_date: string | null;
  camera_ready: string | null;
  conference_date: string | null;
  location: string | null;
  website: string;
  source: string;
  rank: string | null;
}

interface TrackedConference {
  id: string;
  conference_name: string;
  conference_website: string | null;
  topics: string[];
}

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

/** Returns days until a date string. Negative = past. */
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try {
    const dt = new Date(dateStr);
    if (isNaN(dt.getTime())) return null;
    return Math.ceil((dt.getTime() - Date.now()) / 86_400_000);
  } catch {
    return null;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "TBA";
  try {
    const dt = new Date(dateStr);
    if (isNaN(dt.getTime())) return dateStr;
    return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function DeadlineBadge({ dateStr }: { dateStr: string | null }) {
  const days = daysUntil(dateStr);
  if (dateStr === null) return <span className="text-xs text-muted-foreground">TBA</span>;
  if (days === null) return <span className="text-xs text-muted-foreground">{dateStr}</span>;

  let cls = "text-xs font-medium px-2 py-0.5 rounded-full ";
  let label = "";

  if (days < 0) {
    cls += "bg-muted text-muted-foreground line-through";
    label = "Passed";
  } else if (days <= 14) {
    cls += "bg-red-500/15 text-red-600 dark:text-red-400";
    label = `${days}d left`;
  } else if (days <= 30) {
    cls += "bg-orange-500/15 text-orange-600 dark:text-orange-400";
    label = `${days}d left`;
  } else if (days <= 60) {
    cls += "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400";
    label = `${days}d left`;
  } else {
    cls += "bg-green-500/15 text-green-600 dark:text-green-400";
    label = `${days}d left`;
  }

  return (
    <span className={cls}>
      {formatDate(dateStr)} · {label}
    </span>
  );
}

function ConferenceCard({
  conf,
  isTracked,
  onTrack,
  onUntrack,
  trackedId,
}: {
  conf: Conference;
  isTracked: boolean;
  onTrack: (conf: Conference) => void;
  onUntrack: (id: string) => void;
  trackedId?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:border-primary/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {conf.acronym && (
              <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                {conf.acronym}
              </span>
            )}
            {conf.rank && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                CORE {conf.rank}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-sm leading-snug line-clamp-2">{conf.name}</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={() => (isTracked && trackedId ? onUntrack(trackedId) : onTrack(conf))}
          title={isTracked ? "Untrack conference" : "Track conference"}
        >
          {isTracked ? (
            <BookmarkCheck className="w-4 h-4 text-primary" />
          ) : (
            <BookmarkPlus className="w-4 h-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Dates */}
      <div className="space-y-2">
        {conf.submission_deadline !== undefined && (
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground w-24 flex-shrink-0">Submission</span>
            <DeadlineBadge dateStr={conf.submission_deadline} />
          </div>
        )}
        {conf.notification_date && (
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground w-24 flex-shrink-0">Notification</span>
            <span className="text-foreground">{formatDate(conf.notification_date)}</span>
          </div>
        )}
        {conf.camera_ready && (
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground w-24 flex-shrink-0">Camera-ready</span>
            <span className="text-foreground">{formatDate(conf.camera_ready)}</span>
          </div>
        )}
        {conf.conference_date && (
          <div className="flex items-center gap-2 text-xs">
            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground w-24 flex-shrink-0">Conference</span>
            <span className="text-foreground">{formatDate(conf.conference_date)}</span>
          </div>
        )}
        {conf.location && (
          <div className="flex items-center gap-2 text-xs">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground w-24 flex-shrink-0">Location</span>
            <span className="text-foreground truncate">{conf.location}</span>
          </div>
        )}
      </div>

      {/* Topics */}
      {conf.topics.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tag className="w-3 h-3 text-muted-foreground" />
          {conf.topics.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px] font-normal capitalize">
              {t}
            </Badge>
          ))}
        </div>
      )}

      {/* Footer */}
      {conf.website && (
        <a
          href={conf.website}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto pt-3 border-t border-border flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          View on {conf.source === "wikicfp" ? "WikiCFP" : conf.source}
        </a>
      )}
    </div>
  );
}

const POPULAR_TOPICS = [
  "machine learning",
  "natural language processing",
  "computer vision",
  "artificial intelligence",
  "data mining",
  "robotics",
  "bioinformatics",
  "cybersecurity",
];

export default function ConferencesPage() {
  const { selectedProject } = useProject();

  const [conferences, setConferences] = useState<Conference[]>([]);
  const [tracked, setTracked] = useState<TrackedConference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState("machine learning");
  const [mode, setMode] = useState<"search" | "project" | "bookmarks">("search");
  const [showFilters, setShowFilters] = useState(false);
  const [rankFilter, setRankFilter] = useState<string | null>(null);
  const [deadlineFilter, setDeadlineFilter] = useState<"all" | "open" | "soon" | "past">("all");

  const fetchTracked = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/conferences/tracked`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setTracked(data.tracked || []);
      }
    } catch {
      // silently ignore
    }
  }, []);

  const fetchConferences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url: string;
      if (mode === "project" && selectedProject) {
        url = `${API_BASE}/conferences/project/${selectedProject._id}`;
        const res = await fetch(url, { headers: authHeaders() });
        if (!res.ok) throw new Error("Failed to fetch project conferences");
        const data = await res.json();
        setConferences(data.conferences || []);
      } else {
        url = `${API_BASE}/conferences?topics=${encodeURIComponent(topicInput)}&limit=20`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch conferences");
        const data = await res.json();
        setConferences(data.conferences || []);
      }
    } catch (err: any) {
      setError(err.message || "Could not load conferences");
    } finally {
      setLoading(false);
    }
  }, [mode, selectedProject, topicInput]);

  useEffect(() => {
    fetchConferences();
    fetchTracked();
  }, [fetchConferences, fetchTracked]);

  // When project changes and mode is "project", refresh
  useEffect(() => {
    if (mode === "project" && selectedProject) {
      fetchConferences();
    }
  }, [selectedProject, mode]);

  const handleTrack = async (conf: Conference) => {
    const token = getToken();
    if (!token) {
      toast.error("Sign in to track conferences");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/conferences/track`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          conference_name: conf.name,
          conference_website: conf.website,
          topics: conf.topics,
        }),
      });
      if (!res.ok) throw new Error("Failed to track");
      const data = await res.json();
      setTracked((prev) => [
        ...prev,
        {
          id: data.id,
          conference_name: conf.name,
          conference_website: conf.website,
          topics: conf.topics,
        },
      ]);
      toast.success("Conference tracked!");
    } catch {
      toast.error("Could not track conference");
    }
  };

  const handleUntrack = async (trackedId: string) => {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`${API_BASE}/conferences/track/${trackedId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setTracked((prev) => prev.filter((t) => t.id !== trackedId));
      toast.success("Untracked");
    } catch {
      toast.error("Could not untrack");
    }
  };

  const trackedMap = new Map(tracked.map((t) => [t.conference_name, t.id]));

  const activeFilterCount = (rankFilter ? 1 : 0) + (deadlineFilter !== "all" ? 1 : 0);

  const filteredConferences = conferences.filter((conf) => {
    if (rankFilter && conf.rank !== rankFilter) return false;
    if (deadlineFilter !== "all") {
      const days = daysUntil(conf.submission_deadline);
      if (deadlineFilter === "open" && (days === null || days < 0)) return false;
      if (deadlineFilter === "soon" && (days === null || days < 0 || days > 30)) return false;
      if (deadlineFilter === "past" && (days === null || days >= 0)) return false;
    }
    return true;
  });

  const availableRanks = Array.from(new Set(conferences.map((c) => c.rank).filter(Boolean))) as string[];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-lg">Conference Calendar</h1>
              <p className="text-xs text-muted-foreground">
                Upcoming submission deadlines &amp; conference dates
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchConferences}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>

        {/* Mode toggle + search */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              onClick={() => setMode("search")}
              className={`px-3 py-1.5 transition-colors ${
                mode === "search"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              By Topic
            </button>
            <button
              onClick={() => {
                setMode("project");
                if (!selectedProject) toast.info("Select a project first");
              }}
              className={`px-3 py-1.5 transition-colors ${
                mode === "project"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              For My Project
            </button>
            <button
              onClick={() => setMode("bookmarks")}
              className={`px-3 py-1.5 transition-colors flex items-center gap-1.5 ${
                mode === "bookmarks"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              My Bookmarks
              {tracked.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${mode === "bookmarks" ? "bg-primary-foreground/20" : "bg-primary/10 text-primary"}`}>
                  {tracked.length}
                </span>
              )}
            </button>
          </div>

          {mode === "search" && (
            <div className="flex items-center gap-2 flex-1 max-w-lg">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchConferences()}
                  placeholder="e.g. machine learning, nlp, computer vision"
                  className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <Button size="sm" onClick={fetchConferences} disabled={loading}>
                Search
              </Button>
            </div>
          )}

          {mode !== "bookmarks" && (
            <Button
              variant={activeFilterCount > 0 ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-1.5" />
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showFilters ? "rotate-180" : ""}`} />
            </Button>
          )}
        </div>

        {/* Quick topic chips */}
        {mode === "search" && (
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {POPULAR_TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTopicInput(t);
                }}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors capitalize ${
                  topicInput.toLowerCase().includes(t)
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border hover:border-primary/30 hover:bg-muted text-muted-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Filter Panel */}
        {showFilters && mode !== "bookmarks" && (
          <div className="mt-3 border border-border rounded-lg bg-background p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Filter Conferences</span>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setRankFilter(null); setDeadlineFilter("all"); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear all
                </button>
              )}
            </div>

            {/* Deadline filter */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                Submission Deadline
              </label>
              <div className="flex flex-wrap gap-2">
                {(["all", "open", "soon", "past"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDeadlineFilter(d)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      deadlineFilter === d
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    {d === "all" ? "All" : d === "open" ? "Open" : d === "soon" ? "Within 30 days" : "Passed"}
                  </button>
                ))}
              </div>
            </div>

            {/* Rank filter */}
            {availableRanks.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                  CORE Rank
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setRankFilter(null)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      rankFilter === null ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"
                    }`}
                  >
                    All
                  </button>
                  {availableRanks.sort().map((r) => (
                    <button
                      key={r}
                      onClick={() => setRankFilter(r === rankFilter ? null : r)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        rankFilter === r
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      CORE {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground pt-1">
              Showing {filteredConferences.length} of {conferences.length} conferences
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm mb-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* My Bookmarks view */}
        {mode === "bookmarks" && (
          <>
            {tracked.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                <BookmarkCheck className="w-12 h-12 opacity-20 mb-3" />
                <p className="font-medium">No bookmarked conferences</p>
                <p className="text-sm mt-1">
                  Browse conferences and click the bookmark icon to save them here.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-4">
                  {tracked.length} bookmarked conference{tracked.length !== 1 ? "s" : ""}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {tracked.map((t) => (
                    <div
                      key={t.id}
                      className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm leading-snug line-clamp-2">{t.conference_name}</h3>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 flex-shrink-0 text-primary hover:text-destructive"
                          onClick={() => handleUntrack(t.id)}
                          title="Remove bookmark"
                        >
                          <BookmarkCheck className="w-4 h-4" />
                        </Button>
                      </div>

                      {t.topics.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Tag className="w-3 h-3 text-muted-foreground" />
                          {t.topics.map((topic) => (
                            <Badge key={topic} variant="secondary" className="text-[10px] font-normal capitalize">
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {t.conference_website && (
                        <a
                          href={t.conference_website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-auto pt-3 border-t border-border flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Visit website
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Loading */}
        {mode !== "bookmarks" && loading && conferences.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Fetching conferences from WikiCFP…</p>
          </div>
        )}

        {/* No project selected for project mode */}
        {mode === "project" && !selectedProject && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <CalendarDays className="w-12 h-12 opacity-20 mb-3" />
            <p className="font-medium">No project selected</p>
            <p className="text-sm mt-1">
              Select a project from the top bar to see relevant conferences.
            </p>
          </div>
        )}

        {/* Empty */}
        {mode !== "bookmarks" && !loading && !error && conferences.length === 0 && (mode === "search" || selectedProject) && (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <CalendarDays className="w-12 h-12 opacity-20 mb-3" />
            <p className="font-medium">No conferences found</p>
            <p className="text-sm mt-1">
              Try a different topic or check back later.
            </p>
          </div>
        )}

        {/* Conference grid */}
        {mode !== "bookmarks" && !loading && filteredConferences.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground mb-4">
              {filteredConferences.length}{filteredConferences.length !== conferences.length ? ` of ${conferences.length}` : ""} conference{filteredConferences.length !== 1 ? "s" : ""} found
              {mode === "project" && selectedProject
                ? ` relevant to "${selectedProject.name}"`
                : ` for "${topicInput}"`}
              {" · "}Source: WikiCFP
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredConferences.map((conf, i) => (
                <ConferenceCard
                  key={i}
                  conf={conf}
                  isTracked={trackedMap.has(conf.name)}
                  trackedId={trackedMap.get(conf.name)}
                  onTrack={handleTrack}
                  onUntrack={handleUntrack}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
