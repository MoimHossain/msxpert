import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { ToastViewport } from "../ui/ToastViewport";

interface AppShellProps {
  identityName: string | null;
  changesBadge: number;
  children: ReactNode;
}

export function AppShell({ identityName, changesBadge, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar
        entries={[
          { id: "portfolio", label: "Portfolio" },
          { id: "changes", label: "All Changes", badge: changesBadge },
          { id: "team", label: "Team" },
          { id: "pods", label: "PODs" },
          { id: "settings", label: "Settings" },
        ]}
      />
      <div className="app-main">
        <div className="app-topbar">
          <span className="app-name">CSU Console</span>
          {identityName ? <span className="identity-chip">{identityName}</span> : null}
        </div>
        <main className="app-content" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-statusbar">
          Made with <span aria-label="love">{"\u2764\uFE0F"}</span> by Moim
        </footer>
      </div>
      <ToastViewport />
    </div>
  );
}
