/**
 * GroupBadge — AI-generated emblem/badge for groups via Imagen 4.0
 *
 * Generates a flat vector-art badge/emblem from each group's name,
 * governance model, and member composition. Caches results in
 * IndexedDB so generation only happens once per group/prompt combo.
 *
 * Flow: Check IndexedDB cache → if miss, call Imagen 4 API → cache result.
 * Falls back to group-colored hexagon initials if no API key or on error.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Agent, Group, GovernanceModelId } from "../../types";
import { ROLES, GOVERNANCE_MODELS } from "../../constants";
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

/** Map governance model ID to a thematic concept for the prompt */
function governanceTheme(gov: GovernanceModelId): string {
  switch (gov) {
    case "majority":
      return "voting ballot, democratic scales";
    case "threshold":
      return "interlocking keys, multisig lock";
    case "delegated":
      return "crown scepter, delegation arrows";
    case "unanimous":
      return "unified circle, handshake ring";
    default:
      return "abstract governance symbol";
  }
}

/** Build the generation prompt from Group data + member roles */
function buildPrompt(group: Group, members: Agent[]): string {
  const govTheme = governanceTheme(group.governance);
  const govModel = GOVERNANCE_MODELS.find((g) => g.id === group.governance);
  const govLabel = govModel?.label || group.governance;

  // Collect unique member roles for thematic elements
  const uniqueRoles = [...new Set(members.map((a) => a.role))];
  const roleLabels = uniqueRoles
    .map((rid) => ROLES.find((r) => r.id === rid)?.label)
    .filter(Boolean)
    .slice(0, 4);

  const parts = [
    `emblem badge icon for a group called "${group.name}"`,
    `${govLabel} governance theme with ${govTheme}`,
    roleLabels.length > 0
      ? `incorporating ${roleLabels.join(", ")} motifs`
      : null,
    `${members.length} members`,
  ].filter(Boolean);

  return parts.join(", ");
}

// ── In-memory data URL cache ──
const dataUrlCache = new Map<string, string>();

function toDataUrl(cached: CachedPortrait): string {
  return `data:${cached.mimeType};base64,${cached.data}`;
}

// ── Dedup: track in-flight generation per group ──
const inflightGenerations = new Map<string, Promise<CachedPortrait | null>>();

/** Cache key prefix to avoid collision with agent portraits */
function cacheKey(groupId: string): string {
  return `group-${groupId}`;
}

// ── Component ──

interface GroupBadgeProps {
  group: Group;
  /** Member agents — used to build the prompt */
  members?: Agent[];
  /** Pixel size of the square badge (default 48) */
  size?: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function GroupBadge({
  group,
  members = [],
  size = 48,
  className = "",
  onClick,
}: GroupBadgeProps) {
  const color = group.color || "#a1a1aa";
  const key = cacheKey(group.id);

  const prompt = useMemo(
    () => buildPrompt(group, members),
    [group.id, group.governance, members.length],
  );
  const pHash = useMemo(() => promptHash(prompt), [prompt]);

  const [imageUrl, setImageUrl] = useState<string | null>(
    dataUrlCache.get(key) || null,
  );
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    dataUrlCache.has(key) ? "loaded" : "idle",
  );

  const [visible, setVisible] = useState(dataUrlCache.has(key));
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

  // ── Load / generate badge ──
  const loadBadge = useCallback(async () => {
    if (!hasGeminiApiKey()) {
      setStatus("error");
      return;
    }

    setStatus("loading");

    try {
      // 1. Check IndexedDB cache
      const cached = await getCachedPortrait(key, pHash);
      if (cached) {
        const url = toDataUrl(cached);
        dataUrlCache.set(key, url);
        setImageUrl(url);
        setStatus("loaded");
        return;
      }

      // 2. Deduplicate inflight requests
      let generationPromise = inflightGenerations.get(key);
      if (!generationPromise) {
        generationPromise = (async (): Promise<CachedPortrait | null> => {
          try {
            const result = await generatePortrait(prompt, "badge");
            const entry: CachedPortrait = {
              data: result.data,
              mimeType: result.mimeType,
              promptHash: pHash,
              cachedAt: new Date().toISOString(),
            };
            await setCachedPortrait(key, entry);
            return entry;
          } catch (err) {
            console.warn(
              `[GroupBadge] Generation failed for ${group.name}:`,
              err,
            );
            return null;
          } finally {
            inflightGenerations.delete(key);
          }
        })();
        inflightGenerations.set(key, generationPromise);
      }

      const result = await generationPromise;
      if (result) {
        const url = toDataUrl(result);
        dataUrlCache.set(key, url);
        setImageUrl(url);
        setStatus("loaded");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, [key, group.name, prompt, pHash]);

  // Trigger load when visible
  useEffect(() => {
    if (visible && status === "idle") {
      loadBadge();
    }
  }, [visible, status, loadBadge]);

  return (
    <div
      ref={containerRef}
      className={`group-badge-wrap ${className}`}
      onClick={onClick}
      role="img"
      aria-label={`Badge for ${group.name}`}
      style={{
        width: size,
        height: size,
        borderRadius: "14%",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      {/* ── Loading skeleton ── */}
      {status === "loading" && (
        <div
          className="group-badge__skeleton"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "14%",
            background: `${color}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            className="group-badge__pulse"
            style={{
              width: "55%",
              height: "55%",
              borderRadius: "14%",
              border: `2px solid ${color}25`,
              animation: "portrait-pulse 1.4s ease-in-out infinite",
            }}
          />
        </div>
      )}

      {/* ── Generated badge image ── */}
      {status === "loaded" && imageUrl && (
        <img
          src={imageUrl}
          alt={`${group.name} badge`}
          className="group-badge__image"
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      )}

      {/* ── Fallback: group-colored initials ── */}
      {(status === "error" || status === "idle") && (
        <div
          className="group-badge__fallback"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "14%",
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
          {getInitials(group.name)}
        </div>
      )}
    </div>
  );
}
