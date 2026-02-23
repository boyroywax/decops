/**
 * GroupTradingCard — A collectible-style trading card modal for groups.
 *
 * Displays a large AI-generated group badge with governance info,
 * member roster, threshold stats, and identity info in the same
 * trading-card format as the agent version.
 */

import { useRef } from "react";
import { X, Shield, Users, Hexagon, Globe, Vote, Lock, User, Sparkles, Star, Zap } from "lucide-react";
import type { Agent, Group, GovernanceModelId, RoleId } from "../../types";
import { ROLES, GOVERNANCE_MODELS } from "../../constants";
import { GroupBadge } from "./GroupBadge";
import { CopyableId } from "./CopyableId";
import { AgentPortrait } from "./AgentPortrait";

// ── Governance icon mapping ──
const GOV_ICONS: Record<GovernanceModelId, typeof Vote> = {
  majority: Vote,
  threshold: Lock,
  delegated: User,
  unanimous: Sparkles,
};

// ── Stat bar (reuse pattern from AgentTradingCard) ──
function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
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

interface GroupTradingCardProps {
  group: Group;
  /** Resolved member agents */
  members: Agent[];
  /** All networks for lookup */
  networkName?: string;
  networkColor?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function GroupTradingCard({
  group,
  members,
  networkName,
  networkColor,
  isOpen,
  onClose,
}: GroupTradingCardProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const color = group.color || "#a1a1aa";
  const gov = GOVERNANCE_MODELS.find((g) => g.id === group.governance);
  const GovIcon = GOV_ICONS[group.governance] || Shield;

  // Role distribution among members
  const roleDistribution = ROLES.map((r) => ({
    role: r,
    count: members.filter((m) => m.role === r.id).length,
  })).filter((rd) => rd.count > 0);

  // Group stats
  const totalMembers = members.length;
  const uniqueRoles = roleDistribution.length;
  const threshold = group.threshold;
  const hasPrompt = members.filter((m) => !!m.prompt).length;

  return (
    <div
      ref={backdropRef}
      className="tc-backdrop"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="tc-card" style={{ "--tc-accent": color } as React.CSSProperties}>
        {/* ═══ Close button ═══ */}
        <button className="tc-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {/* ═══ Holographic glow ═══ */}
        <div className="tc-glow" style={{ background: `linear-gradient(135deg, ${color}40, transparent 60%, ${color}20)` }} />

        {/* ═══ Badge section ═══ */}
        <div className="tc-portrait-area">
          <div className="tc-portrait-frame" style={{ borderColor: `${color}50`, borderRadius: "14%" }}>
            <GroupBadge group={group} members={members} size={200} />
          </div>
          {/* Member count badge */}
          <div className="tc-power-badge" style={{ background: color, color: "#000" }}>
            <Users size={12} />
            <span>{totalMembers} members</span>
          </div>
        </div>

        {/* ═══ Name + Governance ═══ */}
        <div className="tc-identity">
          <h2 className="tc-name">{group.name}</h2>
          <div className="tc-role" style={{ color }}>
            <GovIcon size={14} />
            <span>{gov?.label || group.governance}</span>
          </div>
          {networkName && (
            <div className="tc-personality" style={{ borderColor: `${networkColor || color}30`, color: `${networkColor || color}cc` }}>
              <Globe size={11} />
              {networkName}
            </div>
          )}
        </div>

        {/* ═══ Group stats ═══ */}
        <div className="tc-stats-section">
          <div className="tc-section-label">Group Metrics</div>
          <div className="tc-stats-grid">
            <StatBar label="MBR" value={totalMembers} max={Math.max(totalMembers, 10)} color={color} />
            <StatBar label="THR" value={threshold} max={totalMembers || 1} color={color} />
            <StatBar label="ROL" value={uniqueRoles} max={5} color={color} />
            <StatBar label="PRM" value={hasPrompt} max={totalMembers || 1} color={color} />
          </div>
        </div>

        {/* ═══ Governance details ═══ */}
        <div className="tc-facts">
          <span className="tc-fact-chip" style={{ background: `${color}12`, borderColor: `${color}20` }}>
            {gov?.label || group.governance}
          </span>
          <span className="tc-fact-chip" style={{ background: `${color}12`, borderColor: `${color}20` }}>
            {threshold}/{totalMembers} threshold
          </span>
          {networkName && (
            <span className="tc-fact-chip" style={{ background: `${networkColor || color}12`, borderColor: `${networkColor || color}20` }}>
              {networkName}
            </span>
          )}
        </div>

        {/* ═══ Role composition ═══ */}
        {roleDistribution.length > 0 && (
          <div className="tc-skills-section">
            <div className="tc-section-label">Role Composition</div>
            <div className="tc-skills-list">
              {roleDistribution.map((rd) => (
                <div key={rd.role.id} className="tc-skill" style={{ borderColor: `${rd.role.color}25` }}>
                  <Zap size={10} style={{ color: rd.role.color, flexShrink: 0 }} />
                  <span className="tc-skill-name">{rd.role.label}</span>
                  <span className="tc-skill-priority" style={{ color: rd.role.color }}>×{rd.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Member roster ═══ */}
        {members.length > 0 && (
          <div className="tc-skills-section">
            <div className="tc-section-label">Members ({members.length})</div>
            <div className="gtc-member-roster">
              {members.map((agent) => {
                const role = ROLES.find((r) => r.id === agent.role);
                return (
                  <div key={agent.id} className="gtc-member-row">
                    <AgentPortrait agent={agent} size={28} />
                    <div className="gtc-member-info">
                      <span className="gtc-member-name">{agent.name}</span>
                      <span className="gtc-member-role" style={{ color: role?.color || "#71717a" }}>
                        {role?.label || agent.role}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ Gov description quote ═══ */}
        {gov?.desc && (
          <div className="tc-quote-section">
            <GovIcon size={12} style={{ color, flexShrink: 0 }} />
            <span className="tc-quote">&ldquo;{gov.desc}&rdquo;</span>
          </div>
        )}

        {/* ═══ Footer: DID + metadata ═══ */}
        <div className="tc-footer">
          <CopyableId value={group.did} truncate={20} label="DID" />
          <div className="tc-meta">
            <span className="tc-meta-item">Group</span>
            <span className="tc-meta-item">{new Date(group.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
