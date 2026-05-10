"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceSidebar } from "@/components/layout/WorkspaceSidebar";
import { PanelLeftClose, PanelLeft, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectSelector } from "@/components/layout/ProjectSelector";
import { UserProfile } from "@/components/layout/UserProfile";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile menu when navigating
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="h-screen flex w-full bg-background overflow-hidden">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile (drawer), visible on md+ */}
      <aside className={`
          fixed md:relative inset-y-0 left-0 z-50
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
          ${sidebarCollapsed ? "md:w-0 md:opacity-0" : "md:w-64 md:opacity-100"}
          w-72
          transition-all duration-300 ease-in-out
          bg-sidebar border-r border-sidebar-border
          flex-shrink-0 overflow-hidden
        `}>
        {/* Mobile close button inside drawer */}
        <div className="md:hidden absolute top-3 right-3 z-10">
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <WorkspaceSidebar currentPath={pathname} />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 flex-shrink-0">
          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            className="h-8 w-8 md:hidden"
          >
            <Menu className="h-4 w-4" />
          </Button>

          {/* Desktop sidebar toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="h-8 w-8 hidden md:flex"
          >
            {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>

          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <ProjectSelector />
            <UserProfile />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}