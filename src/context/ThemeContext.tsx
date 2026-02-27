import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

export type Theme = "dark" | "light" | "solar";
export type ChatPosition = "bottom" | "left" | "right";

const THEME_ORDER: Theme[] = ["dark", "light", "solar"];

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  chatPosition: ChatPosition;
  setChatPosition: (p: ChatPosition) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
  chatPosition: "bottom",
  setChatPosition: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function isValidTheme(v: string | null): v is Theme {
  return v === "dark" || v === "light" || v === "solar";
}

function isValidPosition(v: string | null): v is ChatPosition {
  return v === "bottom" || v === "left" || v === "right";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("decops_theme");
    return isValidTheme(saved) ? saved : "dark";
  });

  const [chatPosition, setChatPosState] = useState<ChatPosition>(() => {
    const saved = localStorage.getItem("decops_chat_position");
    return isValidPosition(saved) ? saved : "bottom";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("decops_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("decops_chat_position", chatPosition);
  }, [chatPosition]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const setChatPosition = useCallback((p: ChatPosition) => setChatPosState(p), []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const idx = THEME_ORDER.indexOf(prev);
      return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, chatPosition, setChatPosition }}>
      {children}
    </ThemeContext.Provider>
  );
}
