import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { setActiveStylePrefixes } from "@/toolkits/image-gen";

export type Theme = "dark" | "light" | "solar";
export type ChatPosition = "bottom" | "left" | "right";

/** A graphics style preset controlling AI-generated image styling */
export interface GraphicsPreset {
  id: string;
  label: string;
  desc: string;
  /** Style prefix prepended to portrait prompts */
  portraitPrefix: string;
  /** Style prefix prepended to badge/emblem prompts */
  badgePrefix: string;
  /** Whether this is a built-in preset (cannot be deleted) */
  builtin?: boolean;
}

/** Built-in graphics presets */
export const GRAPHICS_PRESETS: GraphicsPreset[] = [
  {
    id: "flat-vector",
    label: "Flat Vector",
    desc: "Clean cel-shaded vector art",
    portraitPrefix: "Flat vector art portrait illustration, simple cel-shaded style, limited color palette, clean bold outlines, solid color fills, centered headshot, plain solid color background. ",
    badgePrefix: "Flat vector art emblem badge icon, simple cel-shaded style, limited color palette, clean bold outlines, solid color fills, centered symmetrical design, plain solid color background. ",
    builtin: true,
  },
  {
    id: "anime",
    label: "Anime",
    desc: "Japanese anime-inspired style",
    portraitPrefix: "Anime-style portrait illustration, vivid colors, large expressive eyes, soft shading, centered headshot, clean linework, pastel background. ",
    badgePrefix: "Anime-style emblem badge icon, vivid colors, clean linework, centered symmetrical design, soft gradient background. ",
    builtin: true,
  },
  {
    id: "watercolor",
    label: "Watercolor",
    desc: "Soft painterly watercolor look",
    portraitPrefix: "Watercolor painting portrait, soft washes of color, gentle brush strokes, delicate details, centered headshot, paper texture background, artistic and dreamy feel. ",
    badgePrefix: "Watercolor painting emblem badge, soft washes of color, gentle brush strokes, centered symmetrical design, paper texture background. ",
    builtin: true,
  },
  {
    id: "pixel-art",
    label: "Pixel Art",
    desc: "Retro 16-bit pixel art",
    portraitPrefix: "16-bit pixel art portrait, retro video game style, limited palette, crisp pixels, no anti-aliasing, grid-aligned, centered headshot, solid color background. ",
    badgePrefix: "16-bit pixel art emblem badge icon, retro video game style, limited palette, crisp pixels, centered symmetrical design, solid color background. ",
    builtin: true,
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    desc: "Neon-lit futuristic glow art",
    portraitPrefix: "Cyberpunk portrait illustration, neon glow lighting, dark background with electric blue and magenta highlights, futuristic visor or implants, digital aesthetic, centered headshot. ",
    badgePrefix: "Cyberpunk emblem badge icon, neon glow effects, dark background, electric blue and magenta accents, futuristic digital aesthetic, centered symmetrical design. ",
    builtin: true,
  },
  {
    id: "oil-painting",
    label: "Oil Painting",
    desc: "Classical oil painting style",
    portraitPrefix: "Classical oil painting portrait, rich colors, visible brush strokes, dramatic chiaroscuro lighting, Renaissance-inspired composition, centered headshot, dark moody background. ",
    badgePrefix: "Classical oil painting emblem badge, rich colors, visible brush strokes, dramatic lighting, centered symmetrical design, dark background. ",
    builtin: true,
  },
];

const THEME_ORDER: Theme[] = ["dark", "light", "solar"];

const LS_KEY_GRAPHICS_STYLE = "decops_graphics_style";
const LS_KEY_CUSTOM_PRESETS = "decops_custom_graphics_presets";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  chatPosition: ChatPosition;
  setChatPosition: (p: ChatPosition) => void;
  /** Currently active graphics style preset ID */
  graphicsStyle: string;
  setGraphicsStyle: (id: string) => void;
  /** All available presets (built-in + custom) */
  allGraphicsPresets: GraphicsPreset[];
  /** Add a user-defined custom preset */
  addCustomPreset: (preset: Omit<GraphicsPreset, "id" | "builtin">) => string;
  /** Remove a custom preset */
  removeCustomPreset: (id: string) => void;
  /** Get the active preset object */
  activeGraphicsPreset: GraphicsPreset;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
  chatPosition: "bottom",
  setChatPosition: () => {},
  graphicsStyle: "flat-vector",
  setGraphicsStyle: () => {},
  allGraphicsPresets: GRAPHICS_PRESETS,
  addCustomPreset: () => "",
  removeCustomPreset: () => {},
  activeGraphicsPreset: GRAPHICS_PRESETS[0],
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

function loadCustomPresets(): GraphicsPreset[] {
  try {
    const raw = localStorage.getItem(LS_KEY_CUSTOM_PRESETS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
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

  const [graphicsStyle, setGraphicsStyleState] = useState<string>(() => {
    return localStorage.getItem(LS_KEY_GRAPHICS_STYLE) || "flat-vector";
  });

  const [customPresets, setCustomPresets] = useState<GraphicsPreset[]>(loadCustomPresets);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("decops_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("decops_chat_position", chatPosition);
  }, [chatPosition]);

  useEffect(() => {
    localStorage.setItem(LS_KEY_GRAPHICS_STYLE, graphicsStyle);
  }, [graphicsStyle]);

  // Sync the active style prefixes to the imageGen service
  useEffect(() => {
    const preset = [...GRAPHICS_PRESETS, ...customPresets].find(p => p.id === graphicsStyle) || GRAPHICS_PRESETS[0];
    setActiveStylePrefixes(preset.portraitPrefix, preset.badgePrefix);
  }, [graphicsStyle, customPresets]);

  useEffect(() => {
    localStorage.setItem(LS_KEY_CUSTOM_PRESETS, JSON.stringify(customPresets));
  }, [customPresets]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const setChatPosition = useCallback((p: ChatPosition) => setChatPosState(p), []);
  const setGraphicsStyle = useCallback((id: string) => setGraphicsStyleState(id), []);

  const allGraphicsPresets = [...GRAPHICS_PRESETS, ...customPresets];

  const activeGraphicsPreset = allGraphicsPresets.find(p => p.id === graphicsStyle) || GRAPHICS_PRESETS[0];

  const addCustomPreset = useCallback((preset: Omit<GraphicsPreset, "id" | "builtin">) => {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newPreset: GraphicsPreset = { ...preset, id, builtin: false };
    setCustomPresets(prev => [...prev, newPreset]);
    return id;
  }, []);

  const removeCustomPreset = useCallback((id: string) => {
    setCustomPresets(prev => prev.filter(p => p.id !== id));
    setGraphicsStyleState(prev => prev === id ? "flat-vector" : prev);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const idx = THEME_ORDER.indexOf(prev);
      return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    });
  }, []);

  return (
    <ThemeContext.Provider value={{
      theme, setTheme, toggleTheme,
      chatPosition, setChatPosition,
      graphicsStyle, setGraphicsStyle,
      allGraphicsPresets, addCustomPreset, removeCustomPreset,
      activeGraphicsPreset,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
