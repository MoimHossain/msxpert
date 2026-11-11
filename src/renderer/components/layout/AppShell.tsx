import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { ToastViewport } from "../ui/ToastViewport";
import { useUpdates } from "../../state/UpdateProvider";
import { APP_NAME } from "../../../shared/branding";
import { ShieldCheckmark20Regular } from "@fluentui/react-icons";

interface AppShellProps {
  identityName: string | null;
  identityUsername: string | null;
  changesBadge: number;
  children: ReactNode;
}

export function AppShell({ identityName, identityUsername, changesBadge, children }: AppShellProps) {
  const { state: updates } = useUpdates();
  return (
    <div className="app-shell">
      <Sidebar
        identityName={identityName}
        identityUsername={identityUsername}
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
          <span className="app-name">{APP_NAME} <span className="app-workspace-label">/ Workspace</span></span>
          {updates?.verification === "unsigned-test" ? (
            <span className="unsigned-test-badge" title="Test updates verify checksums and version, not publisher identity. Not for production.">
              Unsigned test build
            </span>
          ) : null}
          <span className="workspace-trust"><ShieldCheckmark20Regular aria-hidden="true" /> Local-first workspace</span>
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
