"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Sparkles, FileText, LayoutGrid, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { UserProfile } from "@/components/layout/UserProfile";
import { ProjectSelector } from "@/components/layout/ProjectSelector";


export default function Landing() {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { user } = useAuth();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/workspace?q=${encodeURIComponent(query)}`);
    }
  };

  const features = [
    {
      icon: FileText,
      title: "Find Papers",
      description: "Search millions of academic papers with AI-powered relevance ranking",
    },
    {
      icon: LayoutGrid,
      title: "Extract Data",
      description: "Automatically extract structured information across papers",
    },
    {
      icon: Lightbulb,
      title: "Synthesize Evidence",
      description: "Get AI-generated summaries with citations and confidence scores",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">ScholarAI</span>
          </div>
          <nav className="flex items-center gap-4">
            <ProjectSelector />
            {/* <Button variant="ghost" onClick={() => router.push("/workspace")}>
              Workspace
            </Button> */}
            {user ? (
              <UserProfile />
            ) : (
              <Button className="cursor-pointer" variant="default" onClick={() => router.push("/auth")}>
                Get Started
              </Button>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-24 md:py-32">
        <div className="container max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            AI-Powered Research Assistant
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-balance">
            Research faster with
            <br />
            <span className="text-primary">intelligent evidence synthesis</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto text-balance">
            Search academic papers, extract structured data, and synthesize findings across studies — all powered by AI.
          </p>

          {/* Search Input */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-6">
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask a research question..."
                className="search-hero pl-14 pr-32"
              />
              <Button
                type="submit"
                size="lg"
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                Search
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </form>

          <p className="text-sm text-muted-foreground">
            Try: "What are the effects of sleep deprivation on memory consolidation?"
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 border-t border-border bg-card">
        <div className="container max-w-5xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div key={feature.title} className="text-center">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 ScholarAI. Built for researchers and students.</p>
        </div>
      </footer>
    </div>
  );
}