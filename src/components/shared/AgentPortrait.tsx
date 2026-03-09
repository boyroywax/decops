/**
 * AgentPortrait — AI-generated portrait via Google Imagen 4.0
 *
 * Generates a high-quality portrait from each agent's AIEOS physicality
 * image_prompts using Google's Imagen 4.0 model. Caches results in
 * IndexedDB so generation only happens once per agent/prompt combo.
 *
 * Flow: Check IndexedDB cache → if miss, call Imagen 4 API → cache result.
 * Falls back to role-colored initials if no API key or on error.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Agent } from "@/types";
import { ROLES } from "@/constants";
import { generatePortrait, hasGeminiApiKey } from "@/toolkits/image-gen";
import {
  getCachedPortrait,
  setCachedPortrait,
  promptHash,
  type CachedPortrait,
} from "@/toolkits/image-gen";
import { getPortraitOptions } from "@/toolkits/image-gen";

// ── Helpers ──

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Map role ID to thematic props/tools for image enrichment */
const ROLE_TOOLS: Record<string, string> = {
  researcher: "holding a magnifying glass, notebook, or data tablet",
  builder: "surrounded by glowing code fragments, toolbelt, wrenches",
  curator: "carrying a leather-bound tome or card catalog, spectacles",
  validator: "a shield emblem, armor pauldron, digital scanning monocle",
  orchestrator: "conducting with glowing batons, holographic interface",
};

/** Map role ID to thematic environment / background */
const ROLE_BACKGROUNDS: Record<string, string> = {
  researcher: "laboratory with beakers and charts in background",
  builder: "industrial workshop with sparks and blueprints",
  curator: "grand library with tall bookshelves in warm light",
  validator: "security command center with monitors and data streams",
  orchestrator: "nexus control room with holographic displays",
};

/**
 * Build a rich, distinctive prompt from the full AIEOS profile.
 *
 * Pulls face, body, style, identity, occupation, personality, and interests
 * to create a unique character description. The art style is NOT included —
 * that is applied separately by the graphics preset prefix in imageGen.
 *
 * @param agent — The agent to describe
 * @param options — Toggle flags for tools/theme and background inclusion
 */
function buildPrompt(
  agent: Agent,
  options: { showTools: boolean; showBackground: boolean },
): string {
  const phys = agent.aieos?.physicality;
  const identity = agent.aieos?.identity;
  const history = agent.aieos?.history;
  const psychology = agent.aieos?.psychology;
  const interests = agent.aieos?.interests;

  const parts: string[] = [];

  // ── Core subject ──
  parts.push("Portrait of a character");

  // Age / gender cues
  const age = identity?.bio?.age_perceived;
  const gender = identity?.bio?.gender;
  if (age || gender) {
    const ageStr = age ? `${age}-year-old` : "";
    parts.push([ageStr, gender].filter(Boolean).join(" "));
  }

  // ── Face details ──
  if (phys?.face) {
    const face = phys.face;
    const faceParts: string[] = [];
    if (face.shape) faceParts.push(`${face.shape} face`);
    if (face.skin?.tone) faceParts.push(`${face.skin.tone} skin`);
    if (face.eyes?.color && face.eyes?.shape) faceParts.push(`${face.eyes.shape} ${face.eyes.color} eyes`);
    else if (face.eyes?.color) faceParts.push(`${face.eyes.color} eyes`);
    if (face.hair?.color) {
      const hairDesc = [face.hair.texture, face.hair.color, face.hair.style || "hair"].filter(Boolean).join(" ");
      faceParts.push(hairDesc);
    }
    if (face.facial_hair && face.facial_hair !== "None" && face.facial_hair !== "none") faceParts.push(face.facial_hair);
    if (face.nose) faceParts.push(`${face.nose} nose`);
    if (face.mouth) faceParts.push(`${face.mouth} mouth`);
    if (face.distinguishing_features?.length) faceParts.push(face.distinguishing_features.slice(0, 2).join(", "));
    if (face.eyes?.corrective_lenses && face.eyes.corrective_lenses !== "None" && face.eyes.corrective_lenses !== "none")
      faceParts.push(face.eyes.corrective_lenses);
    if (faceParts.length > 0) parts.push(faceParts.join(", "));
  }

  // ── Body/build ──
  if (phys?.body) {
    const body = phys.body;
    const bodyParts: string[] = [];
    if (body.somatotype) bodyParts.push(`${body.somatotype.toLowerCase()} build`);
    if (body.build_description) bodyParts.push(body.build_description);
    if (body.posture) bodyParts.push(`${body.posture} posture`);
    if (body.scars_tattoos?.length) bodyParts.push(body.scars_tattoos.slice(0, 2).join(", "));
    if (bodyParts.length > 0) parts.push(bodyParts.join(", "));
  }

  // ── Clothing & accessories ──
  if (phys?.style) {
    const style = phys.style;
    if (style.aesthetic_archetype) parts.push(`${style.aesthetic_archetype} aesthetic`);
    if (style.clothing_preferences?.length) parts.push(`wearing ${style.clothing_preferences.slice(0, 3).join(", ")}`);
    if (style.accessories?.length) parts.push(`with ${style.accessories.slice(0, 2).join(" and ")}`);
    if (style.color_palette?.length) {
      // Convert hex colors into descriptive hints for the image model
      parts.push(`color theme: ${style.color_palette.slice(0, 3).join(", ")}`);
    }
  }

  // ── Occupation hint ──
  if (history?.occupation?.title) {
    parts.push(`occupation: ${history.occupation.title}`);
  }

  // ── Personality flavour ──
  if (psychology?.traits?.mbti) parts.push(`personality vibe: ${psychology.traits.mbti}`);
  if (psychology?.moral_compass?.alignment) parts.push(psychology.moral_compass.alignment);

  // ── Mood / expression ──
  if (psychology?.emotional_profile?.base_mood) {
    parts.push(`${psychology.emotional_profile.base_mood} expression`);
  }

  // ── Hobby / interest hints (small flavor) ──
  if (interests?.hobbies?.length) {
    parts.push(`interests: ${interests.hobbies.slice(0, 2).join(", ")}`);
  }

  // ── Role tools/theme items (toggle-controlled) ──
  if (options.showTools) {
    const tools = ROLE_TOOLS[agent.role];
    if (tools) parts.push(tools);
  }

  // ── Background (toggle-controlled) ──
  if (options.showBackground) {
    const bg = ROLE_BACKGROUNDS[agent.role];
    if (bg) parts.push(bg);
  } else {
    parts.push("plain solid color background");
  }

  // ── Fallback if somehow we have nothing ──
  if (parts.length <= 2) {
    const role = ROLES.find(r => r.id === agent.role);
    parts.push(`AI agent in the ${role?.label || agent.role} role`);
  }

  return parts.join(", ");
}

// ── In-memory data URL cache (prevents re-creating object URLs) ──
const dataUrlCache = new Map<string, string>();

function toDataUrl(portrait: CachedPortrait): string {
  return `data:${portrait.mimeType};base64,${portrait.data}`;
}

// ── Dedup: track in-flight generation per agent to avoid double calls ──
const inflightGenerations = new Map<string, Promise<CachedPortrait | null>>();

// ── Component ──

interface AgentPortraitProps {
  agent: Agent;
  /** Pixel size of the square portrait (default 64) */
  size?: number;
  /** @deprecated — colour is now auto-derived from role */
  strokeColor?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function AgentPortrait({
  agent,
  size = 64,
  className = "",
  onClick,
}: AgentPortraitProps) {
  const role = ROLES.find((r) => r.id === agent.role);
  const color = role?.color || "#a1a1aa";

  const portraitOpts = getPortraitOptions();
  const prompt = useMemo(
    () => buildPrompt(agent, { showTools: portraitOpts.showTools, showBackground: portraitOpts.showBackground }),
    [agent.id, agent.role, portraitOpts.showTools, portraitOpts.showBackground],
  );
  const pHash = useMemo(() => promptHash(prompt), [prompt]);

  const [imageUrl, setImageUrl] = useState<string | null>(
    dataUrlCache.get(agent.id) || null,
  );
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    dataUrlCache.has(agent.id) ? "loaded" : "idle",
  );

  const [visible, setVisible] = useState(dataUrlCache.has(agent.id));
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Lazy-load via IntersectionObserver ──
  useEffect(() => {
    if (visible) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  // ── Load / generate portrait ──
  const loadPortrait = useCallback(async () => {
    // No API key → stay on fallback
    if (!hasGeminiApiKey()) {
      setStatus("error");
      return;
    }

    setStatus("loading");

    try {
      // 1. Check IndexedDB cache
      const cached = await getCachedPortrait(agent.id, pHash);
      if (cached) {
        const url = toDataUrl(cached);
        dataUrlCache.set(agent.id, url);
        setImageUrl(url);
        setStatus("loaded");
        return;
      }

      // 2. Deduplicate inflight requests
      let generationPromise = inflightGenerations.get(agent.id);
      if (!generationPromise) {
        generationPromise = (async (): Promise<CachedPortrait | null> => {
          try {
            const result = await generatePortrait(prompt);
            const entry: CachedPortrait = {
              data: result.data,
              mimeType: result.mimeType,
              promptHash: pHash,
              cachedAt: new Date().toISOString(),
            };
            await setCachedPortrait(agent.id, entry);
            return entry;
          } catch (err) {
            console.warn(`[AgentPortrait] Generation failed for ${agent.name}:`, err);
            return null;
          } finally {
            inflightGenerations.delete(agent.id);
          }
        })();
        inflightGenerations.set(agent.id, generationPromise);
      }

      const result = await generationPromise;
      if (result) {
        const url = toDataUrl(result);
        dataUrlCache.set(agent.id, url);
        setImageUrl(url);
        setStatus("loaded");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, [agent.id, agent.name, prompt, pHash]);

  // Trigger load when visible
  useEffect(() => {
    if (visible && status === "idle") {
      loadPortrait();
    }
  }, [visible, status, loadPortrait]);

  return (
    <div
      ref={containerRef}
      className={`agent-portrait-wrap ${className}`}
      onClick={onClick}
      role="img"
      aria-label={`Portrait of ${agent.name}`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* ── Loading skeleton ── */}
      {status === "loading" && (
        <div
          className="agent-portrait__skeleton"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `${color}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            className="agent-portrait__pulse"
            style={{
              width: "60%",
              height: "60%",
              borderRadius: "50%",
              border: `2px solid ${color}25`,
              animation: "portrait-pulse 1.4s ease-in-out infinite",
            }}
          />
        </div>
      )}

      {/* ── Generated portrait image ── */}
      {status === "loaded" && imageUrl && (
        <img
          src={imageUrl}
          alt={`${agent.name} portrait`}
          className="agent-portrait__image"
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      )}

      {/* ── Fallback: role-colored initials ── */}
      {(status === "error" || status === "idle") && (
        <div
          className="agent-portrait__fallback"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `${color}18`,
            border: `1.5px solid ${color}30`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            fontWeight: 700,
            fontSize: size * 0.34,
            letterSpacing: "0.02em",
            userSelect: "none",
          }}
        >
          {getInitials(agent.name)}
        </div>
      )}
    </div>
  );
}
