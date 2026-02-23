/**
 * imageGen — Google Imagen 4.0 image generation service.
 *
 * Generates high-quality AI portraits using Imagen 4.0 via the
 * Generative Language API (:predict endpoint).
 * Requires a Google AI API key stored in localStorage under "gemini_api_key".
 *
 * Returns base64-encoded image data suitable for caching in IndexedDB.
 */

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Imagen 4.0 — dedicated high-quality image generation model.
 * Uses :predict endpoint with instances/parameters format.
 */
const IMAGE_MODEL = "imagen-4.0-generate-001";

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
 * Generate a portrait image via Imagen 4.0 :predict endpoint.
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

  // Prepend high-quality style directives
  const styledPrompt =
    "Professional high-quality digital portrait, detailed realistic rendering, " +
    "cinematic lighting, sharp focus, centered headshot composition, " +
    "clean solid-color background, studio photography quality. " +
    prompt;

  const url = `${GEMINI_API_BASE}/${IMAGE_MODEL}:predict?key=${apiKey}`;

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
