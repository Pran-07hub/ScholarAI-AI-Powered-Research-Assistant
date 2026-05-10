"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Mail,
  Crown,
  UserX,
  Bell,
  Check,
  X,
  Loader2,
  AlertCircle,
  Copy,
  CheckCheck,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";
import { useAuth } from "@/context/AuthContext";
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

interface Member {
  id: string;
  username: string;
  email: string;
  profile_picture: string | null;
  role: "owner" | "member";
}

interface PendingInvite {
  email: string;
  id: string;
  created_at: string;
}

interface IncomingInvite {
  id: string;
  project_id: string;
  project_name: string;
  inviter_name: string;
  created_at: string;
}

function Avatar({ member }: { member: Member }) {
  if (member.profile_picture) {
    return (
      <img
        src={member.profile_picture}
        alt={member.username}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-2 ring-border"
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0 ring-2 ring-border">
      {member.username[0]?.toUpperCase()}
    </div>
  );
}

export default function CollaborationPage() {
  const { selectedProject, fetchProjects } = useProject();
  const { user } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<IncomingInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const isOwner = members.find((m) => m.id === user?._id)?.role === "owner";

  const fetchMembers = useCallback(async () => {
    if (!selectedProject) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/projects/${selectedProject._id}/members`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load members");
      const data = await res.json();
      setMembers(data.members || []);
      setPendingInvites(data.pending_invites || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  const fetchIncomingInvites = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/invites/mine`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setIncomingInvites(data.invites || []);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchMembers();
    fetchIncomingInvites();
  }, [fetchMembers, fetchIncomingInvites]);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !selectedProject) return;
    setInviting(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${selectedProject._id}/invite`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invite failed");
      toast.success(data.message);
      setInviteEmail("");
      fetchMembers();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedProject) return;
    try {
      await fetch(`${API_BASE}/projects/${selectedProject._id}/members/${memberId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Member removed");
    } catch {
      toast.error("Could not remove member");
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      await fetch(`${API_BASE}/invites/${inviteId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Invite cancelled");
    } catch {
      toast.error("Could not cancel invite");
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    if (acceptingIds.has(inviteId)) return;
    setAcceptingIds((prev) => new Set(prev).add(inviteId));
    try {
      const res = await fetch(`${API_BASE}/invites/${inviteId}/accept`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Accept failed");
      setIncomingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Joined project!");
      await fetchProjects();
      fetchMembers();
    } catch {
      toast.error("Could not accept invite");
    } finally {
      setAcceptingIds((prev) => { const s = new Set(prev); s.delete(inviteId); return s; });
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    try {
      await fetch(`${API_BASE}/invites/${inviteId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setIncomingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Invite declined");
    } catch {
      toast.error("Could not decline invite");
    }
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Collaboration</h1>
              <p className="text-xs text-muted-foreground">
                {selectedProject
                  ? `Manage team for "${selectedProject.name}"`
                  : "Select a project to manage collaborators"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {selectedProject && !loading && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{members.length} member{members.length !== 1 ? "s" : ""}</span>
              </div>
            )}
            {incomingInvites.length > 0 && (
              <Badge className="gap-1.5 bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">
                <Bell className="w-3 h-3" />
                {incomingInvites.length} pending invite{incomingInvites.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Incoming invites (always visible) */}
        {incomingInvites.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Bell className="w-4 h-4" />
              Project Invitations
            </h2>
            <div className="space-y-2">
              {incomingInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3.5 gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-amber-500/10 flex-shrink-0">
                      <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{inv.project_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited by <span className="font-medium">{inv.inviter_name}</span>
                        {" · "}
                        {new Date(inv.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" onClick={() => handleAcceptInvite(inv.id)} disabled={acceptingIds.has(inv.id)}>
                      {acceptingIds.has(inv.id)
                        ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        : <Check className="w-3.5 h-3.5 mr-1.5" />}
                      Accept
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeclineInvite(inv.id)}>
                      <X className="w-3.5 h-3.5 mr-1" />
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!selectedProject ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
            <div className="p-4 rounded-2xl bg-muted mb-4">
              <Users className="w-10 h-10 opacity-40" />
            </div>
            <p className="font-semibold">No project selected</p>
            <p className="text-sm mt-1 max-w-xs">Select a project from the top bar to manage its collaborators.</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-8">
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Invite form (owner only) */}
            {isOwner && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-semibold text-sm mb-1 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  Invite a collaborator
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Enter a colleague's email address. They'll be added immediately if they have an account, otherwise a pending invite is created.
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                      placeholder="colleague@university.edu"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                    {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                    {inviting ? "Sending…" : "Send Invite"}
                  </Button>
                </div>
              </div>
            )}

            {/* Current members */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Team members
                </h2>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {members.length} {members.length === 1 ? "person" : "people"}
                </span>
              </div>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading team…
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-border/80 transition-colors"
                    >
                      <Avatar member={m} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">{m.username}</p>
                          {m.id === user?._id && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">You</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                          <button
                            onClick={() => copyEmail(m.email)}
                            className="text-muted-foreground/60 hover:text-muted-foreground transition-colors flex-shrink-0"
                            title="Copy email"
                          >
                            {copiedEmail === m.email
                              ? <CheckCheck className="w-3 h-3 text-green-500" />
                              : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {m.role === "owner" ? (
                          <Badge className="gap-1 text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/15">
                            <Crown className="w-3 h-3" />
                            Owner
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Shield className="w-3 h-3 opacity-60" />
                            Member
                          </Badge>
                        )}
                        {isOwner && m.role !== "owner" && (
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            className="text-muted-foreground/60 hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-destructive/10"
                            title="Remove member"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending invites */}
            {pendingInvites.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-sm flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    Pending invites
                  </h2>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {pendingInvites.length} waiting
                  </span>
                </div>
                <div className="space-y-2">
                  {pendingInvites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between bg-muted/30 border border-dashed border-border rounded-xl px-4 py-3 gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full border-2 border-dashed border-border flex items-center justify-center flex-shrink-0">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{inv.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Invited {new Date(inv.created_at).toLocaleDateString()} · Awaiting response
                          </p>
                        </div>
                      </div>
                      {isOwner && (
                        <button
                          onClick={() => handleCancelInvite(inv.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-destructive/10 flex-shrink-0"
                          title="Cancel invite"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
