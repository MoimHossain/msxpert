import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { FluentProvider, webDarkTheme, webLightTheme } from "@fluentui/react-components";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const STORAGE_KEY = "csu-console-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialTheme(): Theme {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [theme],
  );

  const fluent = theme === "dark" ? webDarkTheme : webLightTheme;
  const palette: CSSProperties & Record<`--${string}`, string> = {
    "--color-bg": fluent.colorNeutralBackground2,
    "--color-bg-elevated": fluent.colorNeutralBackground1,
    "--color-bg-subtle": fluent.colorNeutralBackground3,
    "--color-border": fluent.colorNeutralStroke2,
    "--color-border-strong": fluent.colorNeutralStroke1,
    "--color-text": fluent.colorNeutralForeground1,
    "--color-text-secondary": fluent.colorNeutralForeground2,
    "--color-brand": fluent.colorBrandForeground1,
    "--color-brand-hover": fluent.colorBrandForeground2Hover,
    "--color-info": fluent.colorBrandForeground1,
    "--color-info-bg": fluent.colorBrandBackground2,
    "--shadow-sm": fluent.shadow4,
    "--shadow-md": fluent.shadow16,
  };
  return (
    <ThemeContext.Provider value={value}>
      <FluentProvider theme={fluent} style={palette} className="fluent-app-theme">
        {children}
      </FluentProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider.");
  return context;
}
