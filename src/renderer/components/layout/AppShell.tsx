import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { ToastViewport } from "../ui/ToastViewport";
import { useUpdates } from "../../state/UpdateProvider";

interface AppShellProps {
  identityName: string | null;
  changesBadge: number;
  children: ReactNode;
}

export function AppShell({ identityName, changesBadge, children }: AppShellProps) {
  const { state: updates } = useUpdates();
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
          {updates?.verification === "unsigned-test" ? (
            <span className="unsigned-test-badge" title="Test updates verify checksums and version, not publisher identity. Not for production.">
              Unsigned test build
            </span>
          ) : null}
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
