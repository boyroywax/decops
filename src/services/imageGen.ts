/**
 * imageGen — Google Gemini image generation service.
 *
 * Generates AI portraits using Gemini 2.5 Flash Image model via the
 * Generative Language API (generateContent with IMAGE responseModality).
 * Requires a Google AI API key stored in localStorage under "gemini_api_key".
 *
 * Returns base64-encoded image data suitable for caching in IndexedDB.
 */

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Model that supports native image generation via generateContent.
 * Uses responseModalities: ["IMAGE", "TEXT"] to get inline image data.
 */
const IMAGE_MODEL = "gemini-2.5-flash-image";

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
 * Generate a portrait image via Gemini generateContent with IMAGE modality.
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
    "Generate an image: flat vector art portrait illustration, simple cel-shaded style, " +
    "limited color palette, clean bold outlines, solid color fills, " +
    "centered headshot, plain solid color background. " +
    prompt;

  const url = `${GEMINI_API_BASE}/${IMAGE_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: styledPrompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Gemini API error (${response.status}): ${errorText.slice(0, 300)}`,
    );
  }

  const data = await response.json();

  // Extract image from candidates → content → parts → inlineData
  const candidates = data?.candidates;
  if (!candidates?.length) {
    throw new Error("Image generation returned no candidates");
  }

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return {
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
        };
      }
    }
  }

  throw new Error("Image generation returned no image data in response");
}
