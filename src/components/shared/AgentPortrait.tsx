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
import type { Agent } from "../../types";
import { ROLES } from "../../constants";
import { generatePortrait, hasGeminiApiKey } from "../../services/imageGen";
import {
  getCachedPortrait,
  setCachedPortrait,
  promptHash,
  type CachedPortrait,
} from "../../services/portraitCache";

// ── Helpers ──

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Build the generation prompt from AIEOS data */
function buildPrompt(agent: Agent): string {
  const phys = agent.aieos?.physicality;
  const base = phys?.image_prompts?.portrait || "";

  if (base) return base;

  // Synthesize from physicality fields
  if (phys) {
    const parts = [
      phys.face?.shape && `${phys.face.shape} face`,
      phys.face?.eyes?.color && `${phys.face.eyes.color} eyes`,
      phys.face?.hair?.color &&
        `${phys.face.hair.color} ${phys.face.hair.style || "hair"}`,
      phys.style?.aesthetic_archetype,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(", ");
  }

  return `AI agent portrait, ${agent.role} role`;
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

  const prompt = useMemo(() => buildPrompt(agent), [agent.id, agent.role]);
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
