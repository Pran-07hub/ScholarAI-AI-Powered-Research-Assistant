"use client";

import { useState, useEffect } from "react";
import {
  Key,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };
}

interface ApiKeySource {
  source: string;
  label: string;
  description: string;
  configured: boolean;
}

export default function ManageApiKeysPage() {
  const [sources, setSources] = useState<ApiKeySource[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [keyValue, setKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchSources = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api-keys`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load API key status");
      const data = await res.json();
      // Sort: configured first, then alphabetically by label
      const sorted = [...(data.sources as ApiKeySource[])].sort((a, b) => {
        if (a.configured !== b.configured) return a.configured ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
      setSources(sorted);
    } catch {
      toast.error("Could not load API key status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const handleSave = async () => {
    if (!selectedSource) {
      toast.error("Please select a source.");
      return;
    }
    if (!keyValue.trim()) {
      toast.error("Please enter an API key.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api-keys/${selectedSource}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ key: keyValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save key");
      toast.success(data.message || "Key saved successfully.");
      setSelectedSource("");
      setKeyValue("");
      await fetchSources();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save key";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (source: string) => {
    setDeleting(source);
    try {
      const res = await fetch(`${API_BASE}/api-keys/${source}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to remove key");
      toast.success(data.message || "Key removed.");
      await fetchSources();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to remove key";
      toast.error(message);
    } finally {
      setDeleting(null);
    }
  };

  const handleUpdateClick = (source: ApiKeySource) => {
    setSelectedSource(source.source);
    setKeyValue("");
    setShowKey(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Key className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Manage API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Add your premium API keys to unlock additional paper sources. Keys are encrypted before storage and used only for your searches.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 mb-6 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
        <ShieldCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
        Your keys are AES-encrypted at rest. They are never returned in API responses and are only decrypted server-side during paper fetches.
      </div>

      {/* Add / Update Form */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <h2 className="text-sm font-medium mb-4">Add or Update a Key</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={selectedSource} onValueChange={setSelectedSource}>
            <SelectTrigger className="sm:w-64">
              <SelectValue placeholder="Select a source..." />
            </SelectTrigger>
            <SelectContent>
              {sources.map((s) => (
                <SelectItem key={s.source} value={s.source}>
                  <span className="flex items-center gap-2">
                    {s.label}
                    {s.configured && (
                      <span className="text-[10px] text-green-600 font-medium">(configured)</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              placeholder="Paste your API key here"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              className="pr-10"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <Button onClick={handleSave} disabled={saving || !selectedSource || !keyValue.trim()}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Validating...
              </>
            ) : (
              "Save Key"
            )}
          </Button>
        </div>
        {selectedSource && (
          <p className="mt-2 text-xs text-muted-foreground">
            {sources.find((s) => s.source === selectedSource)?.description}
          </p>
        )}
      </div>

      {/* Source status table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium">All Sources</h2>
          <Button variant="ghost" size="sm" onClick={fetchSources} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sources.map((source) => (
              <li key={source.source} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium">{source.label}</span>
                    {source.configured ? (
                      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-[11px] gap-1 px-1.5 py-0">
                        <CheckCircle2 className="w-3 h-3" />
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[11px] gap-1 px-1.5 py-0">
                        <XCircle className="w-3 h-3" />
                        Not set
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{source.description}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => handleUpdateClick(source)}
                  >
                    {source.configured ? "Update" : "Add"}
                  </Button>
                  {source.configured && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(source.source)}
                      disabled={deleting === source.source}
                    >
                      {deleting === source.source ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
