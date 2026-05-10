"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceSidebar } from "@/components/layout/WorkspaceSidebar";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectSelector } from "@/components/layout/ProjectSelector";
import { UserProfile } from "@/components/layout/UserProfile";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div className="h-screen flex w-full bg-background overflow-hidden">
      <aside className={`
          ${sidebarCollapsed ? "w-0 opacity-0" : "w-64 opacity-100"}
          transition-all duration-300 ease-in-out
          bg-sidebar border-r border-sidebar-border
          flex-shrink-0 overflow-hidden
        `}>
        <WorkspaceSidebar currentPath={pathname} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4">
          <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="h-8 w-8">
            {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <ProjectSelector />
            <UserProfile />
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
