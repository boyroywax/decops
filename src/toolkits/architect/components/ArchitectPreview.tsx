import { Globe, ArrowLeftRight, Hexagon, GitBranch, Sparkles } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, NETWORK_COLORS } from "@/constants";
import type { MeshConfig } from "@/types";

interface PreviewContentProps {
  preview: MeshConfig;
  deployNetwork: () => void;
  resetArchitect: () => void;
  showActions?: boolean;
}

export function PreviewContent({ preview, deployNetwork, resetArchitect, showActions = true }: PreviewContentProps) {
  const networkCount = preview.networks?.length || 0;
  const bridgeCount = preview.bridges?.length || 0;
  
  return (
    <div className="architect-review">
      <div className="architect-review__blueprint">
        <div className="architect-review__blueprint-header">
          <div className="architect-review__blueprint-title">
            <GradientIcon icon={Sparkles} size={14} gradient={["#fbbf24", "#fcd34d"]} /> Blueprint
          </div>
          <div className="architect-review__blueprint-stats">
            {networkCount > 0 && `${networkCount} network${networkCount !== 1 ? 's' : ''} · `}
            {preview.agents.length} agents · {preview.channels.length} ch · {preview.groups?.length || 0} groups
            {bridgeCount > 0 && ` · ${bridgeCount} bridge${bridgeCount !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* Networks */}
        {preview.networks && preview.networks.length > 0 && (
          <>
            <div className="architect-review__section-label">Networks</div>
            <div className="architect-review__networks-grid">
              {preview.networks.map((n, i) => {
                const color = NETWORK_COLORS[i % NETWORK_COLORS.length];
                const agentCount = n.agents?.length || 0;
                return (
                  <div key={i} className="architect-review__network-card" style={{ borderColor: `${color}30` }}>
                    <div className="architect-review__network-header">
                      <Globe size={14} color={color} />
                      <div className="architect-review__network-name" style={{ color }}>
                        {n.name}
                      </div>
                    </div>
                    {n.description && (
                      <div className="architect-review__network-desc">{n.description}</div>
                    )}
                    <div className="architect-review__network-count">{agentCount} agent{agentCount !== 1 ? 's' : ''}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Agents */}
        <div className="architect-review__section-label">Agents</div>
        <div className="architect-review__agents-grid">
          {preview.agents.map((a, i) => {
            const role = ROLES.find(r => r.id === a.role) || ROLES[0];
            const networkIdx = preview.networks?.findIndex(n => n.agents?.includes(i)) ?? -1;
            const networkColor = networkIdx >= 0 ? NETWORK_COLORS[networkIdx % NETWORK_COLORS.length] : undefined;
            const networkName = networkIdx >= 0 ? preview.networks![networkIdx].name : undefined;
            
            return (
              <div key={i} className="architect-review__agent-card" style={{ borderColor: `${role.color}20` }}>
                <div className="architect-review__agent-header">
                  <span className="architect-review__agent-icon">{role.icon}</span>
                  <div className="architect-review__agent-info">
                    <div className="architect-review__agent-name">{a.name}</div>
                    <div className="architect-review__agent-role" style={{ color: role.color }}>{role.label}</div>
                  </div>
                  {networkName && (
                    <div className="architect-review__agent-network-badge" style={{ background: `${networkColor}15`, color: networkColor }}>
                      <Globe size={9} color={networkColor} />
                      <span className="architect-review__agent-network-label">{networkName}</span>
                    </div>
                  )}
                </div>
                <div className="architect-review__agent-prompt">{a.prompt}</div>
              </div>
            );
          })}
        </div>

        {/* Channels */}
        <div className="architect-review__section-label">Channels</div>
        <div className="architect-review__channels-grid">
          {preview.channels.map((c, i) => {
            const from = preview.agents[c.from];
            const to = preview.agents[c.to];
            const cType = CHANNEL_TYPES.find(t => t.id === c.type) || CHANNEL_TYPES[0];
            if (!from || !to) return null;
            return (
              <div key={i} className="architect-review__channel-card">
                <span className="architect-review__channel-agent">{from.name}</span>
                <ArrowLeftRight size={10} color="#52525b" className="architect-review__channel-arrow" />
                <span className="architect-review__channel-agent">{to.name}</span>
                <span className="architect-review__channel-type">{cType.icon} {cType.label}</span>
              </div>
            );
          })}
        </div>

        {/* Groups */}
        {preview.groups && preview.groups.length > 0 && (
          <>
            <div className="architect-review__section-label">Groups</div>
            <div className="architect-review__groups-grid">
              {preview.groups.map((g, i) => {
                const gov = GOVERNANCE_MODELS.find(m => m.id === g.governance) || GOVERNANCE_MODELS[0];
                return (
                  <div key={i} className="architect-review__group-card">
                    <div className="architect-review__group-name">
                      <GradientIcon icon={Hexagon} size={12} gradient={["#f472b6", "#ec4899"]} /> {g.name}
                    </div>
                    <div className="architect-review__group-gov">{gov.icon} {gov.label}</div>
                    <div className="architect-review__group-members">
                      {g.members.map((idx) => {
                        const a = preview.agents[idx];
                        if (!a) return null;
                        return <span key={idx} className="architect-review__member-badge">{a.name}</span>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Bridges */}
        {preview.bridges && preview.bridges.length > 0 && (
          <>
            <div className="architect-review__section-label">Bridges</div>
            <div className="architect-review__bridges-grid">
              {preview.bridges.map((b, i) => {
                const fromNet = preview.networks?.[b.fromNetwork];
                const toNet = preview.networks?.[b.toNetwork];
                const fromAgent = preview.agents[b.fromAgent];
                const toAgent = preview.agents[b.toAgent];
                const fromColor = NETWORK_COLORS[b.fromNetwork % NETWORK_COLORS.length];
                const toColor = NETWORK_COLORS[b.toNetwork % NETWORK_COLORS.length];
                const cType = CHANNEL_TYPES.find(t => t.id === b.type) || CHANNEL_TYPES[0];
                
                if (!fromNet || !toNet || !fromAgent || !toAgent) return null;
                
                return (
                  <div key={i} className="architect-review__bridge-card">
                    <div className="architect-review__bridge-layout">
                      <div className="architect-review__bridge-endpoint">
                        <div className="architect-review__bridge-net-name" style={{ color: fromColor }}>{fromNet.name}</div>
                        <div className="architect-review__bridge-agent-name">{fromAgent.name}</div>
                      </div>
                      <div className="architect-review__bridge-icon">
                        <GitBranch size={12} color="#fbbf24" />
                        <span className="architect-review__bridge-type">{cType.label}</span>
                      </div>
                      <div className="architect-review__bridge-endpoint">
                        <div className="architect-review__bridge-net-name" style={{ color: toColor }}>{toNet.name}</div>
                        <div className="architect-review__bridge-agent-name">{toAgent.name}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Heartbeat note — replaces former Example Messages preview */}
        {preview.agents && preview.agents.length > 0 && (
          <>
            <div className="architect-review__section-label">Post-Deploy Heartbeat</div>
            <div className="architect-review__message-card">
              <div className="architect-review__message-route">You → all agents</div>
              <div className="architect-review__message-text">
                A heartbeat ping will be sent from you to each of the {preview.agents.length} agent(s) after setup completes to confirm they are online.
              </div>
            </div>
          </>
        )}
      </div>

      {/* Action buttons */}
      {showActions && (
        <div className="architect-review__actions">
          <button onClick={deployNetwork} className="architect-review__deploy-btn">
            <GradientIcon icon={Hexagon} size={14} gradient={["#f472b6", "#ec4899"]} /> Deploy Ecosystem
          </button>
          <button onClick={resetArchitect} className="architect-review__discard-btn">
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
