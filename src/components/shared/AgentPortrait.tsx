/**
 * AgentPortrait — AI-generated portrait with vector art stylization
 *
 * Uses Pollinations.ai (free, no API key) to create a portrait from the
 * agent's AIEOS physicality image_prompts, then applies CSS/SVG filters
 * to achieve a clean, posterized vector art aesthetic.
 *
 * Features:
 * - Deterministic: same agent always gets the same portrait (via seed)
 * - Uses AIEOS image_prompts.portrait for the AI prompt
 * - SVG feComponentTransfer filter for posterized vector-art look
 * - Graceful loading skeleton + initial-letter fallback
 * - Lazy loading via IntersectionObserver
 */

import { useState, useEffect, useRef, useMemo } from "react";
import type { Agent } from "../../types";
import { ROLES } from "../../constants";

// ── Helpers ──

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Portrait URL generation ──

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

function buildPortraitUrl(agent: Agent, size: number): string {
  const phys = agent.aieos?.physicality;
  const basePrompt = phys?.image_prompts?.portrait || "";

  // Fallback from physicality fields if no image_prompt
  const fallbackPrompt = phys
    ? [
        phys.face?.shape && `${phys.face.shape} face`,
        phys.face?.eyes?.color && `${phys.face.eyes.color} eyes`,
        phys.face?.hair?.color &&
          `${phys.face.hair.color} ${phys.face.hair.style || "hair"}`,
        phys.style?.aesthetic_archetype,
      ]
        .filter(Boolean)
        .join(", ") || `AI agent portrait, ${agent.role} role`
    : `AI agent portrait, ${agent.role} role`;

  const prompt = basePrompt || fallbackPrompt;

  const style =
    "flat vector art portrait, simple cel-shaded illustration, limited color palette, " +
    "clean bold outlines, solid color fills, centered face headshot, plain background,";

  const fullPrompt = `${style} ${prompt}`;
  const encoded = encodeURIComponent(fullPrompt);
  const seed = hashCode(agent.id);
  const px = Math.max(size * 3, 256);

  return `${POLLINATIONS_BASE}/${encoded}?width=${px}&height=${px}&seed=${seed}&nologo=true&model=flux`;
}

// ── In-memory load cache (survives re-render, resets on full page reload) ──

const loadedImages = new Set<string>();
const failedImages = new Set<string>();

// ── Component ──

interface AgentPortraitProps {
  agent: Agent;
  /** Pixel size of the square portrait (default 64) */
  size?: number;
  /** @deprecated — colour is now auto from role */
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

  const url = useMemo(
    () => buildPortraitUrl(agent, size),
    [agent.id, agent.role, size],
  );

  const alreadyLoaded = loadedImages.has(url);
  const alreadyFailed = failedImages.has(url);

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    alreadyLoaded ? "loaded" : alreadyFailed ? "error" : "loading",
  );
  const [visible, setVisible] = useState(alreadyLoaded); // skip observer when cached
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

  // ── Image preload ──
  useEffect(() => {
    if (!visible || alreadyLoaded || alreadyFailed) return;
    let cancelled = false;

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      loadedImages.add(url);
      setStatus("loaded");
    };
    img.onerror = () => {
      if (cancelled) return;
      failedImages.add(url);
      setStatus("error");
    };
    img.src = url;

    // 20-second timeout fallback
    const timer = setTimeout(() => {
      if (!loadedImages.has(url) && !cancelled) {
        failedImages.add(url);
        setStatus("error");
      }
    }, 20_000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, url, alreadyLoaded, alreadyFailed]);

  // Unique filter ID (avoids SVG id collisions in the DOM)
  const filterId = useMemo(
    () => `pvec-${hashCode(agent.id) % 99999}`,
    [agent.id],
  );

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
      {/* ── Hidden SVG filter for vector-art posterisation ── */}
      <svg
        width="0"
        height="0"
        style={{ position: "absolute", pointerEvents: "none" }}
      >
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            {/* Light blur to soften before quantisation */}
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" result="b" />
            {/* Posterize — discrete steps reduce tonal range */}
            <feComponentTransfer in="b" result="p">
              <feFuncR
                type="discrete"
                tableValues="0.05 0.2 0.38 0.55 0.72 0.88 1"
              />
              <feFuncG
                type="discrete"
                tableValues="0.05 0.2 0.38 0.55 0.72 0.88 1"
              />
              <feFuncB
                type="discrete"
                tableValues="0.05 0.2 0.38 0.55 0.72 0.88 1"
              />
            </feComponentTransfer>
            {/* Slight contrast boost */}
            <feComponentTransfer in="p">
              <feFuncR type="linear" slope="1.1" intercept="-0.04" />
              <feFuncG type="linear" slope="1.1" intercept="-0.04" />
              <feFuncB type="linear" slope="1.1" intercept="-0.04" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>

      {/* ── Loading skeleton ── */}
      {status === "loading" && visible && (
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

      {/* ── Loaded image with vector filter ── */}
      {status === "loaded" && (
        <img
          src={url}
          alt={`${agent.name} portrait`}
          className="agent-portrait__image"
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: `url(#${filterId})`,
            display: "block",
          }}
        />
      )}

      {/* ── Fallback: initials ── */}
      {(status === "error" || (!visible && !alreadyLoaded)) && (
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
