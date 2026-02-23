/**
 * AgentPortrait — Procedural line-art SVG headshot for agents
 *
 * Generates a unique, minimal line-art portrait from the agent's
 * AIEOS physicality data + role color. Each agent gets a distinct
 * face derived from their identity (deterministic hash of id).
 *
 * Style: single-weight strokes, no fills, monoline illustration.
 */

import type { Agent, AieosPhysicality, RoleId } from "../../types";
import { ROLES } from "../../constants";

// ── Deterministic seed from string ──

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Face shape paths ──

type FaceShape = "oval" | "round" | "angular" | "square" | "diamond" | "heart";

function faceOutline(shape: FaceShape, cx: number, cy: number, w: number, h: number): string {
  // All shapes centered on (cx, cy) with width w and height h
  switch (shape) {
    case "round":
      return `M ${cx},${cy - h / 2} 
              C ${cx + w / 2},${cy - h / 2} ${cx + w / 2},${cy + h / 2} ${cx},${cy + h / 2}
              C ${cx - w / 2},${cy + h / 2} ${cx - w / 2},${cy - h / 2} ${cx},${cy - h / 2} Z`;
    case "angular":
      return `M ${cx},${cy - h / 2}
              L ${cx + w / 2},${cy - h / 5}
              L ${cx + w * 0.38},${cy + h * 0.35}
              L ${cx},${cy + h / 2}
              L ${cx - w * 0.38},${cy + h * 0.35}
              L ${cx - w / 2},${cy - h / 5} Z`;
    case "square":
      return `M ${cx - w * 0.42},${cy - h * 0.45}
              Q ${cx - w * 0.45},${cy - h * 0.48} ${cx - w * 0.35},${cy - h * 0.48}
              L ${cx + w * 0.35},${cy - h * 0.48}
              Q ${cx + w * 0.45},${cy - h * 0.48} ${cx + w * 0.42},${cy - h * 0.45}
              L ${cx + w * 0.42},${cy + h * 0.3}
              Q ${cx + w * 0.38},${cy + h * 0.48} ${cx},${cy + h / 2}
              Q ${cx - w * 0.38},${cy + h * 0.48} ${cx - w * 0.42},${cy + h * 0.3} Z`;
    case "diamond":
      return `M ${cx},${cy - h / 2}
              Q ${cx + w * 0.55},${cy - h * 0.1} ${cx + w / 2},${cy + h * 0.05}
              Q ${cx + w * 0.3},${cy + h * 0.35} ${cx},${cy + h / 2}
              Q ${cx - w * 0.3},${cy + h * 0.35} ${cx - w / 2},${cy + h * 0.05}
              Q ${cx - w * 0.55},${cy - h * 0.1} ${cx},${cy - h / 2} Z`;
    case "heart":
      return `M ${cx},${cy - h * 0.25}
              Q ${cx + w * 0.35},${cy - h * 0.55} ${cx + w * 0.45},${cy - h * 0.2}
              Q ${cx + w * 0.5},${cy + h * 0.05} ${cx + w * 0.35},${cy + h * 0.3}
              L ${cx},${cy + h / 2}
              L ${cx - w * 0.35},${cy + h * 0.3}
              Q ${cx - w * 0.5},${cy + h * 0.05} ${cx - w * 0.45},${cy - h * 0.2}
              Q ${cx - w * 0.35},${cy - h * 0.55} ${cx},${cy - h * 0.25} Z`;
    case "oval":
    default:
      return `M ${cx},${cy - h / 2}
              C ${cx + w * 0.45},${cy - h / 2} ${cx + w * 0.45},${cy + h * 0.4} ${cx},${cy + h / 2}
              C ${cx - w * 0.45},${cy + h * 0.4} ${cx - w * 0.45},${cy - h / 2} ${cx},${cy - h / 2} Z`;
  }
}

// ── Hair style paths ──

function hairPath(
  shape: FaceShape, rand: () => number, cx: number, cy: number, w: number, h: number,
): string {
  const topY = cy - h / 2;
  const hairH = h * 0.15;
  const paths: string[] = [];

  // Scalp line
  paths.push(`M ${cx - w * 0.4},${topY + hairH * 0.5} Q ${cx},${topY - hairH * 1.2} ${cx + w * 0.4},${topY + hairH * 0.5}`);

  // Volume strands based on randomness
  const strands = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < strands; i++) {
    const t = (i + 0.5) / strands;
    const sx = cx - w * 0.42 + t * w * 0.84;
    const startY = topY - hairH * (0.5 + rand() * 0.8);
    const endX = sx + (rand() - 0.5) * w * 0.15;
    const endY = topY + hairH * (0.3 + rand() * 0.5);
    const cpx = sx + (rand() - 0.5) * w * 0.2;
    const cpy = startY - rand() * hairH * 0.4;
    paths.push(`M ${sx},${startY} Q ${cpx},${cpy} ${endX},${endY}`);
  }

  // Side hair (longer for some styles)
  if (rand() > 0.4) {
    const sideLen = h * (0.15 + rand() * 0.25);
    // Left
    paths.push(`M ${cx - w * 0.43},${topY + hairH * 0.3} Q ${cx - w * 0.5},${topY + sideLen * 0.5} ${cx - w * 0.42},${topY + sideLen}`);
    // Right
    paths.push(`M ${cx + w * 0.43},${topY + hairH * 0.3} Q ${cx + w * 0.5},${topY + sideLen * 0.5} ${cx + w * 0.42},${topY + sideLen}`);
  }

  return paths.join(" ");
}

// ── Eye styles ──

function eyePaths(
  rand: () => number, cx: number, cy: number, w: number, _h: number,
): string {
  const eyeY = cy - _h * 0.04;
  const eyeSpacing = w * 0.18;
  const eyeW = w * 0.1;
  const eyeH = w * 0.05;
  const paths: string[] = [];

  // Left eye
  const lx = cx - eyeSpacing;
  paths.push(`M ${lx - eyeW},${eyeY} Q ${lx},${eyeY - eyeH} ${lx + eyeW},${eyeY}`);
  paths.push(`M ${lx - eyeW},${eyeY} Q ${lx},${eyeY + eyeH * 0.6} ${lx + eyeW},${eyeY}`);
  // Iris dot
  const irisR = eyeW * 0.25;
  paths.push(`M ${lx},${eyeY - irisR} A ${irisR},${irisR} 0 1,1 ${lx},${eyeY + irisR} A ${irisR},${irisR} 0 1,1 ${lx},${eyeY - irisR} Z`);

  // Right eye
  const rx = cx + eyeSpacing;
  paths.push(`M ${rx - eyeW},${eyeY} Q ${rx},${eyeY - eyeH} ${rx + eyeW},${eyeY}`);
  paths.push(`M ${rx - eyeW},${eyeY} Q ${rx},${eyeY + eyeH * 0.6} ${rx + eyeW},${eyeY}`);
  // Iris dot
  paths.push(`M ${rx},${eyeY - irisR} A ${irisR},${irisR} 0 1,1 ${rx},${eyeY + irisR} A ${irisR},${irisR} 0 1,1 ${rx},${eyeY - irisR} Z`);

  // Eyebrows
  const browY = eyeY - eyeH * 2.2;
  const browArch = eyeH * (0.5 + rand() * 1.0);
  paths.push(`M ${lx - eyeW * 1.1},${browY + browArch * 0.3} Q ${lx},${browY - browArch} ${lx + eyeW * 1.1},${browY + browArch * 0.2}`);
  paths.push(`M ${rx - eyeW * 1.1},${browY + browArch * 0.2} Q ${rx},${browY - browArch} ${rx + eyeW * 1.1},${browY + browArch * 0.3}`);

  return paths.join(" ");
}

// ── Nose ──

function nosePath(rand: () => number, cx: number, cy: number, w: number, h: number): string {
  const noseY = cy + h * 0.08;
  const noseH = h * (0.08 + rand() * 0.05);
  const noseW = w * (0.06 + rand() * 0.04);

  return `M ${cx},${noseY - noseH} L ${cx + noseW},${noseY} L ${cx - noseW},${noseY}`;
}

// ── Mouth ──

function mouthPath(rand: () => number, cx: number, cy: number, w: number, h: number): string {
  const mouthY = cy + h * 0.22;
  const mouthW = w * (0.1 + rand() * 0.06);
  const smile = h * 0.01 * (rand() > 0.5 ? 1 : -0.3); // slight smile or neutral
  return `M ${cx - mouthW},${mouthY} Q ${cx},${mouthY + smile * 2} ${cx + mouthW},${mouthY}`;
}

// ── Ears (subtle) ──

function earPaths(cx: number, cy: number, w: number, h: number): string {
  const earY = cy - h * 0.04;
  const earH = h * 0.1;
  return [
    `M ${cx - w * 0.44},${earY - earH} Q ${cx - w * 0.52},${earY} ${cx - w * 0.44},${earY + earH}`,
    `M ${cx + w * 0.44},${earY - earH} Q ${cx + w * 0.52},${earY} ${cx + w * 0.44},${earY + earH}`,
  ].join(" ");
}

// ── Neck & shoulders ──

function neckAndShoulders(cx: number, cy: number, w: number, h: number): string {
  const chinY = cy + h / 2;
  const neckW = w * 0.12;
  const shoulderY = chinY + h * 0.25;
  return [
    // Neck
    `M ${cx - neckW},${chinY} L ${cx - neckW},${shoulderY - h * 0.05}`,
    `M ${cx + neckW},${chinY} L ${cx + neckW},${shoulderY - h * 0.05}`,
    // Shoulders
    `M ${cx - neckW},${shoulderY - h * 0.05} Q ${cx - w * 0.35},${shoulderY} ${cx - w * 0.6},${shoulderY + h * 0.08}`,
    `M ${cx + neckW},${shoulderY - h * 0.05} Q ${cx + w * 0.35},${shoulderY} ${cx + w * 0.6},${shoulderY + h * 0.08}`,
  ].join(" ");
}

// ── Glasses (for some agents) ──

function glassesPaths(cx: number, cy: number, w: number, h: number): string {
  const eyeY = cy - h * 0.04;
  const spacing = w * 0.18;
  const r = w * 0.11;
  return [
    // Left lens
    `M ${cx - spacing - r},${eyeY - r * 0.8} Q ${cx - spacing},${eyeY - r} ${cx - spacing + r},${eyeY - r * 0.8} Q ${cx - spacing + r * 1.1},${eyeY} ${cx - spacing + r},${eyeY + r * 0.7} Q ${cx - spacing},${eyeY + r * 0.9} ${cx - spacing - r},${eyeY + r * 0.7} Q ${cx - spacing - r * 1.1},${eyeY} ${cx - spacing - r},${eyeY - r * 0.8}`,
    // Right lens
    `M ${cx + spacing - r},${eyeY - r * 0.8} Q ${cx + spacing},${eyeY - r} ${cx + spacing + r},${eyeY - r * 0.8} Q ${cx + spacing + r * 1.1},${eyeY} ${cx + spacing + r},${eyeY + r * 0.7} Q ${cx + spacing},${eyeY + r * 0.9} ${cx + spacing - r},${eyeY + r * 0.7} Q ${cx + spacing - r * 1.1},${eyeY} ${cx + spacing - r},${eyeY - r * 0.8}`,
    // Bridge
    `M ${cx - spacing + r},${eyeY - r * 0.3} Q ${cx},${eyeY - r * 0.6} ${cx + spacing - r},${eyeY - r * 0.3}`,
    // Temples
    `M ${cx - spacing - r},${eyeY - r * 0.4} L ${cx - w * 0.46},${eyeY - r * 0.3}`,
    `M ${cx + spacing + r},${eyeY - r * 0.4} L ${cx + w * 0.46},${eyeY - r * 0.3}`,
  ].join(" ");
}

// ── Role accent decorations ──

function roleDecoration(role: RoleId, rand: () => number, cx: number, size: number): string {
  const paths: string[] = [];
  const y = size * 0.87; // near shoulder area

  switch (role) {
    case "researcher":
      // Small magnifying glass near shoulder
      paths.push(`M ${cx + size * 0.35},${y} A ${size * 0.04},${size * 0.04} 0 1,1 ${cx + size * 0.35},${y + 0.001} Z`);
      paths.push(`M ${cx + size * 0.38},${y + size * 0.03} L ${cx + size * 0.42},${y + size * 0.06}`);
      break;
    case "builder":
      // Small hex/bolt near shoulder  
      paths.push(`M ${cx + size * 0.38},${y - size * 0.02} L ${cx + size * 0.41},${y - size * 0.01} L ${cx + size * 0.41},${y + size * 0.02} L ${cx + size * 0.38},${y + size * 0.03} L ${cx + size * 0.35},${y + size * 0.02} L ${cx + size * 0.35},${y - size * 0.01} Z`);
      break;
    case "curator":
      // Small book/page
      paths.push(`M ${cx + size * 0.34},${y - size * 0.02} L ${cx + size * 0.42},${y - size * 0.02} L ${cx + size * 0.42},${y + size * 0.04} L ${cx + size * 0.34},${y + size * 0.04} Z`);
      paths.push(`M ${cx + size * 0.38},${y - size * 0.02} L ${cx + size * 0.38},${y + size * 0.04}`);
      break;
    case "validator":
      // Small checkmark
      paths.push(`M ${cx + size * 0.33},${y + size * 0.01} L ${cx + size * 0.37},${y + size * 0.04} L ${cx + size * 0.43},${y - size * 0.02}`);
      break;
    case "orchestrator":
      // Small node/network dots
      const dots = [[0.34, 0], [0.41, -0.02], [0.41, 0.03]] as const;
      for (const [dx, dy] of dots) {
        const r = size * 0.008;
        paths.push(`M ${cx + size * dx},${y + size * dy - r} A ${r},${r} 0 1,1 ${cx + size * dx},${y + size * dy + r} A ${r},${r} 0 1,1 ${cx + size * dx},${y + size * dy - r} Z`);
      }
      paths.push(`M ${cx + size * 0.34},${y} L ${cx + size * 0.41},${y - size * 0.02}`);
      paths.push(`M ${cx + size * 0.34},${y} L ${cx + size * 0.41},${y + size * 0.03}`);
      break;
  }
  return paths.join(" ");
}

// ── Resolve face shape from AIEOS data ──

function resolveFaceShape(phys?: AieosPhysicality, fallback?: FaceShape): FaceShape {
  const raw = phys?.face?.shape?.toLowerCase() || "";
  const map: Record<string, FaceShape> = {
    oval: "oval", round: "round", angular: "angular",
    square: "square", diamond: "diamond", heart: "heart",
    oblong: "oval", rectangular: "square", triangular: "angular",
  };
  for (const [key, shape] of Object.entries(map)) {
    if (raw.includes(key)) return shape;
  }
  return fallback || "oval";
}

// ── Has glasses? ──

function hasGlasses(phys?: AieosPhysicality): boolean {
  if (!phys?.face) return false;
  const features = phys.face.distinguishing_features || [];
  const eyes = phys.face.eyes?.corrective_lenses || "";
  return (
    features.some(f => f.toLowerCase().includes("glass")) ||
    eyes.includes("glass") || eyes.includes("monocle")
  );
}

// ── Main component ──

interface AgentPortraitProps {
  agent: Agent;
  /** Pixel size of the square SVG (default 64) */
  size?: number;
  /** Override stroke color (defaults to role color) */
  strokeColor?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function AgentPortrait({
  agent,
  size = 64,
  strokeColor,
  className = "",
  onClick,
}: AgentPortraitProps) {
  const role = ROLES.find(r => r.id === agent.role);
  const color = strokeColor || role?.color || "#a1a1aa";
  const phys = agent.aieos?.physicality;

  // Deterministic random from agent id
  const seed = hashCode(agent.id);
  const rand = seededRandom(seed);

  // Viewbox dimensions
  const vb = 100;
  const cx = vb / 2;
  const cy = vb * 0.40; // head center, slightly above middle
  const headW = vb * 0.52;
  const headH = vb * 0.54;

  const shape = resolveFaceShape(phys, ["oval", "round", "angular", "square", "diamond"][seed % 5] as FaceShape);
  const showGlasses = hasGlasses(phys) || (rand() < 0.2);

  const strokeW = 1.2;

  return (
    <svg
      viewBox={`0 0 ${vb} ${vb}`}
      width={size}
      height={size}
      className={`agent-portrait ${className}`}
      onClick={onClick}
      role="img"
      aria-label={`Portrait of ${agent.name}`}
      style={{ display: "block" }}
    >
      {/* Background circle */}
      <circle
        cx={cx}
        cy={cx}
        r={cx - 1}
        fill="none"
        stroke={color}
        strokeWidth={0.5}
        opacity={0.15}
      />

      {/* All line art in one group */}
      <g
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Neck & shoulders */}
        <path d={neckAndShoulders(cx, cy, headW, headH)} opacity={0.6} />

        {/* Ears */}
        <path d={earPaths(cx, cy, headW, headH)} opacity={0.5} />

        {/* Face outline */}
        <path d={faceOutline(shape, cx, cy, headW, headH)} />

        {/* Hair */}
        <path d={hairPath(shape, rand, cx, cy, headW, headH)} strokeWidth={strokeW * 0.9} />

        {/* Eyes */}
        <path d={eyePaths(rand, cx, cy, headW, headH)} strokeWidth={strokeW * 0.8} />

        {/* Nose */}
        <path d={nosePath(rand, cx, cy, headW, headH)} strokeWidth={strokeW * 0.7} opacity={0.6} />

        {/* Mouth */}
        <path d={mouthPath(rand, cx, cy, headW, headH)} strokeWidth={strokeW * 0.8} />

        {/* Glasses (if applicable) */}
        {showGlasses && (
          <path d={glassesPaths(cx, cy, headW, headH)} strokeWidth={strokeW * 0.7} opacity={0.7} />
        )}

        {/* Role decoration */}
        <path
          d={roleDecoration(agent.role, rand, cx, vb)}
          strokeWidth={strokeW * 0.6}
          opacity={0.5}
        />
      </g>
    </svg>
  );
}
