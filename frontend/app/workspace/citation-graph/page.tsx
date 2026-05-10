"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  GitFork,
  Loader2,
  Sparkles,
  RefreshCw,
  AlertCircle,
  FileText,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

interface GraphNode {
  id: string;
  title: string;
  authors: string[];
  year: string | null;
  url: string;
  type: "project" | "external";
  ss_id?: string;
  cited_by_count?: number;
  // Layout positions (added client-side)
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "internal" | "external";
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    project_papers: number;
    external_nodes: number;
    internal_edges: number;
    external_edges: number;
  };
}

// ── Force-directed layout (simple spring simulation) ────────────────────────

function initLayout(nodes: GraphNode[], width: number, height: number): GraphNode[] {
  return nodes.map((n, i) => ({
    ...n,
    x: width / 2 + (Math.random() - 0.5) * 300,
    y: height / 2 + (Math.random() - 0.5) * 300,
    vx: 0,
    vy: 0,
  }));
}

function runSimulationStep(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  alpha: number
): GraphNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const REPULSION = 4000;
  const SPRING_LEN = 120;
  const SPRING_K = 0.05;
  const DAMPING = 0.85;
  const CENTER_K = 0.01;

  // Copy
  const next = nodes.map((n) => ({ ...n }));
  const nextMap = new Map(next.map((n) => [n.id, n]));

  // Repulsion between all pairs
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i];
      const b = next[j];
      const dx = b.x - a.x || 0.01;
      const dy = b.y - a.y || 0.01;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (REPULSION / (dist * dist)) * alpha;
      a.vx -= (dx / dist) * force;
      a.vy -= (dy / dist) * force;
      b.vx += (dx / dist) * force;
      b.vy += (dy / dist) * force;
    }
  }

  // Spring attraction along edges
  for (const edge of edges) {
    const a = nextMap.get(edge.source);
    const b = nextMap.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - SPRING_LEN) * SPRING_K * alpha;
    a.vx += (dx / dist) * force;
    a.vy += (dy / dist) * force;
    b.vx -= (dx / dist) * force;
    b.vy -= (dy / dist) * force;
  }

  // Gentle pull toward center
  for (const n of next) {
    n.vx += (width / 2 - n.x) * CENTER_K * alpha;
    n.vy += (height / 2 - n.y) * CENTER_K * alpha;
  }

  // Apply velocity + damping + boundary
  for (const n of next) {
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x = Math.max(40, Math.min(width - 40, n.x + n.vx));
    n.y = Math.max(40, Math.min(height - 40, n.y + n.vy));
  }

  return next;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CitationGraphPage() {
  const { selectedProject } = useProject();
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasBuilt, setHasBuilt] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);

  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const alphaRef = useRef(1);
  const [renderTick, setRenderTick] = useState(0);

  const W = 900;
  const H = 600;

  useEffect(() => {
    setGraphData(null);
    setNodes([]);
    setHasBuilt(false);
    setError(null);
    setSelectedNode(null);
    if (animRef.current) cancelAnimationFrame(animRef.current);
  }, [selectedProject]);

  const fetchGraph = useCallback(async () => {
    if (!selectedProject) return toast.info("Select a project first");
    setLoading(true);
    setError(null);
    setHasBuilt(false);
    setSelectedNode(null);
    if (animRef.current) cancelAnimationFrame(animRef.current);

    try {
      const res = await fetch(
        `${API_BASE}/discovery/citation-graph/${selectedProject._id}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      if (!res.ok) throw new Error("Failed to build graph");
      const data: GraphData = await res.json();
      setGraphData(data);

      if (data.nodes.length === 0) {
        setLoading(false);
        setHasBuilt(true);
        return;
      }

      // Initialise layout
      const initialNodes = initLayout(data.nodes as GraphNode[], W, H);
      nodesRef.current = initialNodes;
      alphaRef.current = 1;
      setHasBuilt(true);

      // Run simulation
      const simulate = () => {
        if (alphaRef.current < 0.01) {
          setNodes([...nodesRef.current]);
          return;
        }
        nodesRef.current = runSimulationStep(
          nodesRef.current,
          data.edges,
          W,
          H,
          alphaRef.current
        );
        alphaRef.current *= 0.97;
        setRenderTick((t) => t + 1);
        animRef.current = requestAnimationFrame(simulate);
      };
      animRef.current = requestAnimationFrame(simulate);
    } catch (e: any) {
      setError(e.message || "Could not build citation graph");
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  // Sync nodesRef → nodes for final render
  useEffect(() => {
    setNodes([...nodesRef.current]);
  }, [renderTick]);

  if (!selectedProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <GitFork className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No project selected</p>
          <p className="text-sm mt-1">Select a project to visualise its citation network.</p>
        </div>
      </div>
    );
  }

  const edges = graphData?.edges || [];
  const stats = graphData?.stats;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitFork className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-semibold text-lg">Citation Graph</h1>
              <p className="text-xs text-muted-foreground">
                How papers in <span className="font-medium text-foreground">{selectedProject.name}</span> cite each other
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stats && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground mr-2">
                <span>{stats.project_papers} papers</span>
                <span>{stats.external_nodes} external</span>
                <span>{stats.internal_edges} internal links</span>
              </div>
            )}
            <Button
              variant={hasBuilt ? "outline" : "default"}
              size="sm"
              onClick={fetchGraph}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : hasBuilt ? (
                <RefreshCw className="w-4 h-4 mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {loading ? "Building…" : hasBuilt ? "Rebuild" : "Build Graph"}
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">
        {/* Graph canvas */}
        <div className="flex-1 relative overflow-hidden bg-muted/20">
          {!hasBuilt && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground text-center">
              <GitFork className="w-16 h-16 opacity-20 mb-4" />
              <p className="font-medium text-lg mb-1">Citation network not built</p>
              <p className="text-sm max-w-sm">
                Click <span className="font-medium text-foreground">"Build Graph"</span> to fetch citation
                relationships via Semantic Scholar and visualise how your papers connect.
              </p>
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm">Fetching citation data from Semantic Scholar…</p>
              <p className="text-xs">This may take 10-20s for large projects.</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8">
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/30 rounded-lg p-4 max-w-md">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            </div>
          )}

          {hasBuilt && nodes.length === 0 && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground text-center">
              <FileText className="w-12 h-12 opacity-20 mb-3" />
              <p className="font-medium">No citation links found</p>
              <p className="text-sm mt-1 max-w-sm">
                Your papers couldn't be matched in Semantic Scholar, or they don't cite each other.
              </p>
            </div>
          )}

          {hasBuilt && nodes.length > 0 && (
            <>
              {/* Zoom controls */}
              <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
                <button
                  onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
                  className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}
                  className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              {/* Legend */}
              <div className="absolute bottom-3 left-3 bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-4 text-xs z-10">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span>Your papers</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-orange-400" />
                  <span>External (cited by 2+)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5 bg-primary/60" />
                  <span>Internal citation</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5 bg-orange-300" />
                  <span>External citation</span>
                </div>
              </div>

              <svg
                ref={svgRef}
                width="100%"
                height="100%"
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-full"
                style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
              >
                <defs>
                  <marker id="arrow-internal" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="hsl(var(--primary) / 0.5)" />
                  </marker>
                  <marker id="arrow-external" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="rgb(251 146 60 / 0.5)" />
                  </marker>
                </defs>

                {/* Edges */}
                {edges.map((edge, i) => {
                  const src = nodes.find((n) => n.id === edge.source);
                  const tgt = nodes.find((n) => n.id === edge.target);
                  if (!src || !tgt) return null;
                  const isInternal = edge.type === "internal";
                  return (
                    <line
                      key={i}
                      x1={src.x}
                      y1={src.y}
                      x2={tgt.x}
                      y2={tgt.y}
                      stroke={isInternal ? "hsl(var(--primary) / 0.35)" : "rgb(251 146 60 / 0.35)"}
                      strokeWidth={isInternal ? 1.5 : 1}
                      markerEnd={isInternal ? "url(#arrow-internal)" : "url(#arrow-external)"}
                    />
                  );
                })}

                {/* Nodes */}
                {nodes.map((node) => {
                  const isProject = node.type === "project";
                  const isSelected = selectedNode?.id === node.id;
                  const r = isProject ? 16 : 11;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x},${node.y})`}
                      className="cursor-pointer"
                      onClick={() => setSelectedNode(isSelected ? null : node)}
                    >
                      <circle
                        r={r + (isSelected ? 4 : 0)}
                        fill={
                          isProject
                            ? "hsl(var(--primary))"
                            : "rgb(251 146 60)"
                        }
                        opacity={isSelected ? 1 : 0.85}
                        stroke={isSelected ? "white" : "none"}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                      <text
                        textAnchor="middle"
                        dy={r + 14}
                        fontSize={10}
                        fill="currentColor"
                        className="fill-foreground pointer-events-none select-none"
                      >
                        {(node.year || "")}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </>
          )}
        </div>

        {/* Side panel — selected node details */}
        {selectedNode && (
          <div className="w-72 flex-shrink-0 border-l border-border bg-card overflow-y-auto p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm leading-snug">{selectedNode.title}</h3>
              <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                <span className="text-lg leading-none">×</span>
              </button>
            </div>

            {selectedNode.authors?.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedNode.authors.join(", ")}
              </p>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {selectedNode.year && (
                <Badge variant="secondary" className="text-[10px]">{selectedNode.year}</Badge>
              )}
              <Badge
                variant={selectedNode.type === "project" ? "default" : "outline"}
                className="text-[10px]"
              >
                {selectedNode.type === "project" ? "Your paper" : "External"}
              </Badge>
              {selectedNode.cited_by_count != null && (
                <Badge variant="secondary" className="text-[10px]">
                  Cited by {selectedNode.cited_by_count} of your papers
                </Badge>
              )}
            </div>

            {/* Citation stats for this node */}
            <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-3">
              <p className="font-medium text-foreground mb-1">In this graph:</p>
              <p>
                Cites:{" "}
                {edges.filter((e) => e.source === selectedNode.id).length} paper(s)
              </p>
              <p>
                Cited by:{" "}
                {edges.filter((e) => e.target === selectedNode.id).length} paper(s)
              </p>
            </div>

            {selectedNode.url && (
              <a
                href={selectedNode.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View paper
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
