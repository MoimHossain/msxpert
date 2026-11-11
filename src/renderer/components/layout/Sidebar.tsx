import { classNames } from "../../lib/format";
import { useNavigation } from "../../state/NavigationProvider";
import { useTheme } from "../../state/ThemeProvider";

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
}

export function Sidebar({ entries }: SidebarProps) {
  const { route, navigate } = useNavigation();
  const { theme, toggleTheme } = useTheme();
  const activeName = route.name === "account" ? "portfolio" : route.name;

  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="sidebar-brand">CSU Console</div>
      <ul className="sidebar-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className={classNames(
                "sidebar-link",
                activeName === entry.id && "sidebar-link-active",
              )}
              aria-current={activeName === entry.id ? "page" : undefined}
              onClick={() => navigate({ name: entry.id })}
            >
              <span>{entry.label}</span>
              {entry.badge ? (
                <span className="sidebar-badge" aria-label={`${entry.badge} outstanding`}>
                  {entry.badge}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      >
        <span aria-hidden="true">{theme === "dark" ? "\u2600" : "\u263E"}</span>
        <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
      </button>
    </nav>
  );
}
