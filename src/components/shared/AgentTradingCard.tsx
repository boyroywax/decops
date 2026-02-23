/**
 * AgentTradingCard — A collectible-style trading card modal.
 *
 * Displays a large AI-generated portrait with the agent's key stats,
 * AIEOS personality traits, skills, and identity info laid out in
 * an attractive trading-card format.
 */

import { useRef } from "react";
import { X, Shield, Brain, Heart, Sparkles, Star, Zap, Globe, Microscope, Package } from "lucide-react";
import type { Agent, RoleId } from "../../types";
import { ROLES } from "../../constants";
import { AgentPortrait } from "./AgentPortrait";
import { CopyableId } from "./CopyableId";

// ── Role icon mapping (text-only for the card) ──
const ROLE_ICONS: Record<RoleId, typeof Microscope> = {
  researcher: Microscope,
  builder: Zap,
  curator: Package,
  validator: Shield,
  orchestrator: Globe,
};

// ── Stat bar helper ──
function StatBar({ label, value, max = 10, color }: { label: string; value: number; max?: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="tc-stat">
      <div className="tc-stat__label">{label}</div>
      <div className="tc-stat__bar">
        <div className="tc-stat__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="tc-stat__value" style={{ color }}>{value}</div>
    </div>
  );
}

// ── Main component ──

interface AgentTradingCardProps {
  agent: Agent;
  isOpen: boolean;
  onClose: () => void;
}

export function AgentTradingCard({ agent, isOpen, onClose }: AgentTradingCardProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const role = ROLES.find((r) => r.id === agent.role);
  const color = role?.color || "#a1a1aa";
  const RoleIcon = ROLE_ICONS[agent.role] || Star;

  const aieos = agent.aieos;
  const identity = aieos?.identity;
  const phys = aieos?.physicality;
  const psych = aieos?.psychology;
  const ling = aieos?.linguistics;
  const hist = aieos?.history;
  const interests = aieos?.interests;
  const motivations = aieos?.motivations;
  const skills = aieos?.capabilities?.skills || [];

  // Neural matrix stats (0-10 scale)
  const neural = psych?.neural_matrix;
  const neuralStats = neural
    ? [
        { label: "CRE", key: "creativity", value: neural.creativity },
        { label: "EMP", key: "empathy", value: neural.empathy },
        { label: "LOG", key: "logic", value: neural.logic },
        { label: "ADP", key: "adaptability", value: neural.adaptability },
        { label: "CHR", key: "charisma", value: neural.charisma },
        { label: "REL", key: "reliability", value: neural.reliability },
      ].filter((s) => s.value != null)
    : [];

  // Derived "power level" from neural stats
  const totalPower = neuralStats.reduce((sum, s) => sum + (s.value || 0), 0);
  const maxPower = neuralStats.length * 10;

  // MBTI or temperament
  const personality = psych?.traits?.mbti || psych?.traits?.temperament || psych?.traits?.enneagram || null;

  // Key life facts
  const facts: string[] = [];
  if (identity?.origin?.nationality) facts.push(identity.origin.nationality);
  if (hist?.occupation?.title) facts.push(hist.occupation.title);
  if (hist?.education?.field) facts.push(hist.education.field);
  if (phys?.style?.aesthetic_archetype) facts.push(phys.style.aesthetic_archetype);

  // Top skills (max 4)
  const topSkills = skills.slice(0, 4);

  return (
    <div
      ref={backdropRef}
      className="tc-backdrop"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="tc-card" style={{ "--tc-accent": color } as React.CSSProperties}>
        {/* ═══ Card close button ═══ */}
        <button className="tc-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {/* ═══ Top: holographic border glow ═══ */}
        <div className="tc-glow" style={{ background: `linear-gradient(135deg, ${color}40, transparent 60%, ${color}20)` }} />

        {/* ═══ Portrait section ═══ */}
        <div className="tc-portrait-area">
          <div className="tc-portrait-frame" style={{ borderColor: `${color}50` }}>
            <AgentPortrait agent={agent} size={200} />
          </div>
          {/* Rarity / power badge */}
          {neuralStats.length > 0 && (
            <div className="tc-power-badge" style={{ background: color, color: "#000" }}>
              <Sparkles size={12} />
              <span>{totalPower}/{maxPower}</span>
            </div>
          )}
        </div>

        {/* ═══ Name + Role ═══ */}
        <div className="tc-identity">
          <h2 className="tc-name">{agent.name}</h2>
          <div className="tc-role" style={{ color }}>
            <RoleIcon size={14} />
            <span>{role?.label || agent.role}</span>
          </div>
          {personality && (
            <div className="tc-personality" style={{ borderColor: `${color}30`, color: `${color}cc` }}>
              <Brain size={11} />
              {personality}
            </div>
          )}
        </div>

        {/* ═══ Quick facts ribbon ═══ */}
        {facts.length > 0 && (
          <div className="tc-facts">
            {facts.map((f, i) => (
              <span key={i} className="tc-fact-chip" style={{ background: `${color}12`, borderColor: `${color}20` }}>
                {f}
              </span>
            ))}
          </div>
        )}

        {/* ═══ Neural Stats ═══ */}
        {neuralStats.length > 0 && (
          <div className="tc-stats-section">
            <div className="tc-section-label">Neural Matrix</div>
            <div className="tc-stats-grid">
              {neuralStats.map((s) => (
                <StatBar key={s.key} label={s.label} value={s.value!} color={color} />
              ))}
            </div>
          </div>
        )}

        {/* ═══ Skills ═══ */}
        {topSkills.length > 0 && (
          <div className="tc-skills-section">
            <div className="tc-section-label">Skills</div>
            <div className="tc-skills-list">
              {topSkills.map((sk) => (
                <div key={sk.name} className="tc-skill" style={{ borderColor: `${color}25` }}>
                  <Zap size={10} style={{ color, flexShrink: 0 }} />
                  <span className="tc-skill-name">{sk.name}</span>
                  {sk.priority && (
                    <span className="tc-skill-priority" style={{ color }}>P{sk.priority}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Motivation / core drive ═══ */}
        {motivations?.core_drive && (
          <div className="tc-quote-section">
            <Heart size={12} style={{ color, flexShrink: 0 }} />
            <span className="tc-quote">&ldquo;{motivations.core_drive}&rdquo;</span>
          </div>
        )}

        {/* ═══ Footer: DID + metadata ═══ */}
        <div className="tc-footer">
          <CopyableId value={agent.did} truncate={20} label="DID" />
          <div className="tc-meta">
            <span className="tc-meta-item">AIEOS v{aieos?.standard?.version || "1.1.0"}</span>
            <span className="tc-meta-item">{new Date(agent.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
