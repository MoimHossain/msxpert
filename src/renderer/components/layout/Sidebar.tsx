import { classNames } from "../../lib/format";
import { useNavigation } from "../../state/NavigationProvider";
import { useTheme } from "../../state/ThemeProvider";
import { Avatar, Button, Tooltip } from "@fluentui/react-components";
import {
  ArrowTrendingLines24Regular, Grid24Regular, History24Regular,
  People24Regular, Settings24Regular, WeatherMoon24Regular, WeatherSunny24Regular,
} from "@fluentui/react-icons";
import { BrandMark } from "./BrandMark";

/** Sidebar links are only the routes with no required parameters; account detail is
 * reached from a portfolio account card instead of from the rail. */
export type SimpleRouteName = "portfolio" | "changes" | "team" | "pods" | "settings";

interface NavEntry {
  id: SimpleRouteName;
  label: string;
  badge?: number;
}

interface SidebarProps {
  entries: NavEntry[];
  identityName: string | null;
  identityUsername: string | null;
}

const icons = {
  portfolio: <ArrowTrendingLines24Regular />,
  changes: <History24Regular />,
  team: <People24Regular />,
  pods: <Grid24Regular />,
  settings: <Settings24Regular />,
};

export function Sidebar({ entries, identityName, identityUsername }: SidebarProps) {
  const { route, navigate } = useNavigation();
  const { theme, toggleTheme } = useTheme();
  const activeName = route.name === "account" ? "portfolio" : route.name;

  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="sidebar-brand"><BrandMark /></div>
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
              appearance="subtle"
              icon={icons[entry.id]}
              onClick={() => navigate({ name: entry.id })}
            >
              <span className="sidebar-link-label">{entry.label}</span>
              {entry.badge ? (
                <span className="sidebar-badge" aria-label={`${entry.badge} outstanding`}>
                  {entry.badge}
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
            onClick={() => navigate({ name: "settings" })}
          >
            Settings
          </Button>
          <Tooltip content={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} relationship="label">
            <Button
              appearance="subtle"
              className="theme-toggle"
              icon={theme === "dark" ? <WeatherSunny24Regular /> : <WeatherMoon24Regular />}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onClick={toggleTheme}
            />
          </Tooltip>
        </div>
        <div className="sidebar-profile">
          <Avatar name={identityName ?? identityUsername ?? "User"} color="colorful" size={36} />
          <div className="sidebar-profile-copy">
            <strong title={identityName ?? identityUsername ?? undefined}>{identityName ?? identityUsername ?? "Signed in"}</strong>
            <span title={identityUsername ?? undefined}>{identityUsername ?? "Connected to Microsoft Sales"}</span>
          </div>
          <span className="profile-connected" title="Signed in" aria-label="Signed in" />
        </div>
      </div>
    </nav>
  );
}
