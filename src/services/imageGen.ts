/**
 * imageGen — Google Imagen 4.0 image generation service.
 *
 * Generates high-quality AI portraits using Imagen 4.0 via the
 * Generative Language API (:predict endpoint).
 * Requires a Google AI API key stored in localStorage under "gemini_api_key".
 *
 * Returns base64-encoded image data suitable for caching in IndexedDB.
 */

import { getImageModel } from "./ai";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Imagen 4.0 — dedicated high-quality image generation model.
 * Uses :predict endpoint with instances/parameters format.
 * Defaults to imagen-4.0-generate-001, overridable via LLM Manager.
 */
const DEFAULT_IMAGE_MODEL = "imagen-4.0-generate-001";

// ── Default style prefixes (fallback when no graphics preset loaded) ──
const DEFAULT_PORTRAIT_PREFIX = "Flat vector art portrait illustration, simple cel-shaded style, limited color palette, clean bold outlines, solid color fills, centered headshot, plain solid color background. ";
const DEFAULT_BADGE_PREFIX = "Flat vector art emblem badge icon, simple cel-shaded style, limited color palette, clean bold outlines, solid color fills, centered symmetrical design, plain solid color background. ";

// ── Active style override (set by ThemeContext / DisplayPanel) ──
let _activePortraitPrefix: string | null = null;
let _activeBadgePrefix: string | null = null;

// ── Portrait generation options (toggles for tools / background) ──
export interface PortraitOptions {
  /** Show role-themed tools/props in portrait (default true) */
  showTools: boolean;
  /** Show thematic background instead of plain solid (default false) */
  showBackground: boolean;
}

const LS_KEY_PORTRAIT_OPTIONS = "decops_portrait_options";

let _portraitOptions: PortraitOptions = loadPortraitOptions();

function loadPortraitOptions(): PortraitOptions {
  try {
    const raw = localStorage.getItem(LS_KEY_PORTRAIT_OPTIONS);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { showTools: true, showBackground: false };
}

/** Get current portrait toggle options */
export function getPortraitOptions(): PortraitOptions {
  return _portraitOptions;
}

/** Update portrait toggle options (persisted to localStorage) */
export function setPortraitOptions(opts: Partial<PortraitOptions>): void {
  _portraitOptions = { ..._portraitOptions, ...opts };
  localStorage.setItem(LS_KEY_PORTRAIT_OPTIONS, JSON.stringify(_portraitOptions));
}

/** Called by ThemeContext when the graphics style changes */
export function setActiveStylePrefixes(portrait: string, badge: string): void {
  _activePortraitPrefix = portrait;
  _activeBadgePrefix = badge;
}

/** Get the current portrait style prefix */
export function getPortraitStylePrefix(): string {
  return _activePortraitPrefix || DEFAULT_PORTRAIT_PREFIX;
}

/** Get the current badge style prefix */
export function getBadgeStylePrefix(): string {
  return _activeBadgePrefix || DEFAULT_BADGE_PREFIX;
}

// ── API key management ──

export function getGeminiApiKey(): string | null {
  return localStorage.getItem("gemini_api_key");
}

export function setGeminiApiKey(key: string): void {
  if (key.trim()) {
    localStorage.setItem("gemini_api_key", key.trim());
  } else {
    localStorage.removeItem("gemini_api_key");
  }
}

export function hasGeminiApiKey(): boolean {
  return !!localStorage.getItem("gemini_api_key");
}

// ── Image generation ──

export interface GeneratedImage {
  /** Raw base64 data (no data: prefix) */
  data: string;
  /** MIME type */
  mimeType: string;
}

export type ImageStyle = "portrait" | "badge";

/**
 * Generate an image via Imagen 4.0 :predict endpoint.
 *
 * @param prompt — text-to-image prompt string
 * @param style — "portrait" for agent headshots, "badge" for group emblems
 * @returns base64-encoded image or throws on failure
 */
export async function generatePortrait(
  prompt: string,
  style: ImageStyle = "portrait",
): Promise<GeneratedImage> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "No Google AI API key configured. Go to Profile & Settings to add your Gemini key.",
    );
  }

  // Style-specific prefix (from active graphics preset)
  const stylePrefix =
    style === "badge"
      ? getBadgeStylePrefix()
      : getPortraitStylePrefix();

  const styledPrompt = stylePrefix + prompt;

  const imageModelId = getImageModel() || DEFAULT_IMAGE_MODEL;
  const url = `${GEMINI_API_BASE}/${imageModelId}:predict?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [
        { prompt: styledPrompt },
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: "1:1",
        personGeneration: "allow_all",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Imagen API error (${response.status}): ${errorText.slice(0, 300)}`,
    );
  }

  const data = await response.json();

  // Extract image from predictions[].bytesBase64Encoded
  const predictions = data?.predictions;
  if (!predictions?.length) {
    throw new Error("Image generation returned no predictions");
  }

  for (const prediction of predictions) {
    if (prediction.bytesBase64Encoded) {
      return {
        data: prediction.bytesBase64Encoded,
        mimeType: prediction.mimeType || "image/png",
      };
    }
  }

  throw new Error("Image generation returned no image data in response");
}
