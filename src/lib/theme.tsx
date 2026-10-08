// Light / dark theme. Default follows the device ("system"); a choice made with the toggle is remembered on
// this device. The class is set by a tiny inline script before first paint (THEME_SCRIPT), so a dark page
// never flashes white, then kept in sync here.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "app.theme";

/** Runs in <head> before the page paints. Keep it tiny and dependency-free. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export function resolveTheme(choice: ThemeChoice, systemDark: boolean) {
  return choice === "dark" || (choice === "system" && systemDark) ? "dark" : "light";
}

type Ctx = { choice: ThemeChoice; resolved: "light" | "dark"; setChoice: (c: ThemeChoice) => void };
const ThemeContext = createContext<Ctx>({
  choice: "system",
  resolved: "light",
  setChoice: () => {},
});

const systemDark = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [sysDark, setSysDark] = useState(false);

  // Read the saved choice after mount (the server cannot see it; the head script already applied it).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") setChoiceState(saved);
    } catch {
      /* private mode */
    }
    setSysDark(systemDark());
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);

  const resolved = resolveTheme(choice, sysDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    try {
      if (c === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, c);
    } catch {
      /* private mode: applies for this visit only */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ choice, resolved, setChoice }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

/** Sun/moon button: switches to the opposite of what is shown now (and remembers it). */
export function ThemeToggle({
  ar,
  className,
  variant = "ghost",
}: {
  ar: boolean;
  className?: string;
  variant?: "ghost" | "outline";
}) {
  const { resolved, setChoice } = useTheme();
  const dark = resolved === "dark";
  const label = dark ? (ar ? "الوضع الفاتح" : "Light mode") : ar ? "الوضع الداكن" : "Dark mode";
  return (
    <Button
      type="button"
      variant={variant}
      size="icon"
      className={className}
      onClick={() => setChoice(dark ? "light" : "dark")}
      aria-label={label}
      title={label}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
