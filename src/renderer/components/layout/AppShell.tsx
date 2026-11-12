import { useState, type ReactNode } from "react";
import { Sidebar, type NavEntry } from "./Sidebar";
import { ToastViewport } from "../ui/ToastViewport";
import { useUpdates } from "../../state/UpdateProvider";
import { APP_NAME } from "../../../shared/branding";
import { ShieldCheckmark20Regular } from "@fluentui/react-icons";
import type { UserProfile } from "../../../shared/types";
import { useLoadedAppData } from "../../state/AppDataProvider";
import { useToast } from "../../state/ToastProvider";

interface AppShellProps {
  identityName: string | null;
  identityUsername: string | null;
  profile: UserProfile | null;
  changesBadge: number;
  children: ReactNode;
}

export function AppShell({ identityName, identityUsername, profile, changesBadge, children }: AppShellProps) {
  const { state: updates } = useUpdates();
  const { settings } = useLoadedAppData();
  const { notify } = useToast();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("csu-console-sidebar-collapsed") === "true");
  const entries: NavEntry[] = [
    { id: "portfolio", label: "Portfolio" },
    { id: "changes", label: "All Changes", badge: changesBadge },
    { id: "team", label: "Team" },
    { id: "pods", label: "PODs" },
    { id: "settings", label: "Settings" },
  ];
  const toggleSidebar = () => {
    try {
      localStorage.setItem("csu-console-sidebar-collapsed", String(!collapsed));
      setCollapsed(!collapsed);
    } catch {
      notify("Could not save your sidebar preference. Try again.", "critical");
    }
  };
  return (
    <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`}>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleSidebar}
        identityName={identityName}
        identityUsername={identityUsername}
        profile={profile}
        entries={entries.filter(entry => (entry.id !== "team" || settings.teamEnabled) &&
          (entry.id !== "pods" || settings.podsEnabled))}
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
