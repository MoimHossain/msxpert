import { classNames } from "../../lib/format";
import { useNavigation } from "../../state/NavigationProvider";
import { Avatar, Button } from "@fluentui/react-components";
import {
  ArrowTrendingLines24Regular, Grid24Regular, History24Regular,
  People24Regular, Settings24Regular, PanelLeftContract24Regular, PanelLeftExpand24Regular, CalendarLtr24Regular, Home24Regular, ChartMultiple24Regular,
} from "@fluentui/react-icons";
import { BrandMark } from "./BrandMark";
import type { UserProfile } from "../../../shared/types";

/** Sidebar links are only the routes with no required parameters; account detail is
 * reached from a portfolio account card instead of from the rail. */
export type SimpleRouteName = "overview" | "portfolio" | "acr" | "milestones" | "changes" | "team" | "pods" | "settings";

export interface NavEntry {
  id: SimpleRouteName;
  label: string;
  badge?: number;
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  entries: NavEntry[];
  identityName: string | null;
  identityUsername: string | null;
  profile: UserProfile | null;
}

const icons = {
  overview: <Home24Regular />,
  portfolio: <ArrowTrendingLines24Regular />,
  acr: <ChartMultiple24Regular />,
  milestones: <CalendarLtr24Regular />,
  changes: <History24Regular />,
  team: <People24Regular />,
  pods: <Grid24Regular />,
  settings: <Settings24Regular />,
};

export function Sidebar({ entries, identityName, identityUsername, profile, collapsed, onToggleCollapsed }: SidebarProps) {
  const { route, navigate } = useNavigation();
  const activeName = route.name === "account" ? "portfolio" : route.name;

  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="sidebar-brand"><BrandMark /></div>
      <Button className="sidebar-collapse" appearance="subtle"
        icon={collapsed ? <PanelLeftExpand24Regular /> : <PanelLeftContract24Regular />}
        aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"}
        title={collapsed ? "Expand sidebar" : "Minimize sidebar"}
        aria-expanded={!collapsed}
        onClick={onToggleCollapsed}>
        <span className="sidebar-link-label">Minimize</span>
      </Button>
      <div className="sidebar-section-label">Workspace</div>
      <ul className="sidebar-list">
        {entries.filter((entry) => entry.id !== "settings").map((entry) => (
          <li key={entry.id}>
            <Button
              type="button"
              className={classNames(
                "sidebar-link",
                activeName === entry.id && "sidebar-link-active",
              )}
              aria-current={activeName === entry.id ? "page" : undefined}
              aria-label={`${entry.label}${entry.badge ? `, ${entry.badge} outstanding` : ""}`}
              title={collapsed ? entry.label : undefined}
              appearance="subtle"
              icon={icons[entry.id]}
              onClick={() => navigate({ name: entry.id })}
            >
              <span className="sidebar-link-label">{entry.label}</span>
              {entry.badge ? (
                <span className="sidebar-badge" aria-label={`${entry.badge} outstanding`}>
                  {collapsed && entry.badge > 99 ? "99+" : entry.badge}
                </span>
              ) : null}
            </Button>
          </li>
        ))}
      </ul>
      <div className="sidebar-footer">
        <div className="sidebar-utilities">
          <Button
            className={classNames("sidebar-settings", activeName === "settings" && "sidebar-link-active")}
            appearance="subtle"
            icon={<Settings24Regular />}
            aria-current={activeName === "settings" ? "page" : undefined}
            aria-label="Settings"
            title={collapsed ? "Settings" : undefined}
            onClick={() => navigate({ name: "settings" })}
          >
            <span className="sidebar-link-label">Settings</span>
          </Button>
        </div>
        <div className="sidebar-profile" title={collapsed ? profile?.displayName ?? identityName ?? identityUsername ?? "Signed in" : undefined}>
          <Avatar name={profile?.displayName ?? identityName ?? identityUsername ?? "User"} color="colorful" size={36}
            {...(profile?.photoDataUrl ? { image: { src: profile.photoDataUrl } } : {})} />
          <div className="sidebar-profile-copy">
            <strong>{profile?.displayName ?? identityName ?? identityUsername ?? "Signed in"}</strong>
            <span title={profile?.jobTitle ?? identityUsername ?? undefined}>{profile?.jobTitle ?? identityUsername ?? "Connected to Microsoft Sales"}</span>
          </div>
          <span className="profile-connected" title="Signed in" aria-label="Signed in" />
        </div>
      </div>
    </nav>
  );
}
