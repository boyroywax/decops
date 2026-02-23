/**
 * imageGen — Google Gemini / Imagen image generation service.
 *
 * Generates AI portraits using Google's Imagen 3 model via the
 * Generative Language API. Requires a Google AI API key stored
 * in localStorage under "gemini_api_key".
 *
 * Returns base64-encoded image data suitable for caching in IndexedDB.
 */

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

// Imagen 3 model for image generation
const IMAGE_MODEL = "imagen-3.0-generate-002";

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

/**
 * Generate a portrait image with Imagen 3 via the Gemini API.
 *
 * @param prompt — text-to-image prompt string
 * @returns base64-encoded image or throws on failure
 */
export async function generatePortrait(
  prompt: string,
): Promise<GeneratedImage> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "No Google AI API key configured. Go to Profile & Settings to add your Gemini key.",
    );
  }

  // Prepend style directives for consistent vector-art portraits
  const styledPrompt =
    "flat vector art portrait illustration, simple cel-shaded style, " +
    "limited color palette, clean bold outlines, solid color fills, " +
    "centered headshot, plain solid color background, " +
    prompt;

  const url = `${GEMINI_API_BASE}/${IMAGE_MODEL}:predict?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: styledPrompt }],
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
      `Imagen API error (${response.status}): ${errorText.slice(0, 200)}`,
    );
  }

  const data = await response.json();

  // Imagen 3 returns predictions array
  const prediction = data?.predictions?.[0];
  if (!prediction?.bytesBase64Encoded) {
    throw new Error("Image generation returned no image data");
  }

  return {
    data: prediction.bytesBase64Encoded,
    mimeType: prediction.mimeType || "image/png",
  };
}
