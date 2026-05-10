"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { PanelLeftClose, PanelLeft } from "lucide-react";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
}

export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const pathname = usePathname();

  return (
    <div className="h-screen w-full bg-background flex overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${isSidebarOpen ? "w-64" : "w-0"
          } border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out overflow-hidden`}
      >
        <div className="h-full w-64">
          <WorkspaceSidebar currentPath={pathname} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toggle Button */}
        <div className="absolute top-4 left-4 z-10 md:hidden">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 bg-background border border-border rounded-lg shadow-sm"
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Desktop Toggle */}
        <div className="hidden md:block absolute top-4 left-4 z-10 transition-all duration-300 ease-in-out" style={{ left: isSidebarOpen ? "17rem" : "1rem" }}>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 bg-background/50 backdrop-blur-sm border border-border rounded-lg shadow-sm hover:bg-background transition-colors"
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
            ) : (
              <PanelLeft className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>

        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
      </div>
    </div>
  );
}