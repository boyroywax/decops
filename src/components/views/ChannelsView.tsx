import type { Agent, Channel, ChannelForm, ViewId, Message, Network } from "../../types";
import { CHANNEL_TYPES, ROLES } from "../../constants";
import { inputStyle, SectionTitle, BulkCheckbox, BulkActionBar, PillButton } from "../shared/ui";
import { ArrowLeftRight, X, Globe } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { useBulkSelect } from "../../hooks/useBulkSelect";

interface ChannelsViewProps {
  agents: Agent[];
  channels: Channel[];
  messages: Message[];
  ecosystems: Network[];
  channelForm: ChannelForm;
  setChannelForm: (v: ChannelForm) => void;
  createChannel: () => void;
  removeChannel: (id: string) => void;
  removeChannels: (ids: Set<string>) => void;
  setActiveChannel: (id: string) => void;
  setView: (v: ViewId) => void;
}

export function ChannelsView({
  agents, channels, messages, ecosystems,
  channelForm, setChannelForm,
  createChannel, removeChannel, removeChannels, setActiveChannel, setView,
}: ChannelsViewProps) {
  const bulk = useBulkSelect();

  const getNetworkName = (networkId?: string) => {
    if (!networkId) return null;
    const net = ecosystems.find(n => n.id === networkId);
    return net ? { name: net.name, color: net.color } : null;
  };

  const handleBulkDelete = () => {
    removeChannels(bulk.selected);
    bulk.clearSelection();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}><GradientIcon icon={ArrowLeftRight} size={18} gradient={["#a78bfa", "#c084fc"]} /> P2P Channels</h2>
        {channels.length > 0 && (
          <BulkCheckbox
            checked={bulk.isAllSelected(channels.map(c => c.id))}
            onChange={() => bulk.toggleAll(channels.map(c => c.id))}
            color="#a78bfa"
          />
        )}
      </div>

      {agents.length < 2 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#3f3f46", border: "1px dashed rgba(167,139,250,0.15)", borderRadius: 12 }}>
          <div style={{ fontSize: 12 }}>Need at least 2 agents.</div>
        </div>
      ) : (
        <div style={{ background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.12)", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <SectionTitle text="Establish Channel" />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={channelForm.from} onChange={(e) => setChannelForm({ ...channelForm, from: e.target.value })} style={{ ...inputStyle, width: "auto", minWidth: 140, border: "1px solid rgba(167,139,250,0.2)" }}>
              <option value="">From…</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <ArrowLeftRight size={10} color="#52525b" />
            <select value={channelForm.to} onChange={(e) => setChannelForm({ ...channelForm, to: e.target.value })} style={{ ...inputStyle, width: "auto", minWidth: 140, border: "1px solid rgba(167,139,250,0.2)" }}>
              <option value="">To…</option>
              {agents.filter((a) => a.id !== channelForm.from).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 4 }}>
              {CHANNEL_TYPES.map((t) => (
                <PillButton key={t.id} active={channelForm.type === t.id} activeColor="#a78bfa" onClick={() => setChannelForm({ ...channelForm, type: t.id })}>
                  {t.icon} {t.label}
                </PillButton>
              ))}
            </div>
            <button onClick={createChannel} style={{ background: "#a78bfa", color: "#0a0a0f", border: "none", padding: "10px 18px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500 }}>Connect</button>
          </div>
        </div>
      )}

      {channels.map((ch) => {
        const from = agents.find((a) => a.id === ch.from);
        const to = agents.find((a) => a.id === ch.to);
        const cType = CHANNEL_TYPES.find((t) => t.id === ch.type);
        const msgCount = messages.filter((m) => m.channelId === ch.id).length;
        const network = getNetworkName(ch.networkId);
        const isChecked = bulk.has(ch.id);
        if (!from || !to) return null;
        return (
          <div key={ch.id} style={{ background: isChecked ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${isChecked ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.05)"}`, borderRadius: 8, padding: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.2s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
              <BulkCheckbox checked={isChecked} onChange={() => bulk.toggle(ch.id)} color="#a78bfa" />
              <span style={{ color: ROLES.find(r => r.id === from.role)?.color }}>{from.name}</span>
              <ArrowLeftRight size={10} color="#52525b" />
              <span style={{ color: ROLES.find(r => r.id === to.role)?.color }}>{to.name}</span>
              <span style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa", padding: "3px 8px", borderRadius: 4, fontSize: 10 }}>{cType?.icon} {cType?.label}</span>
              {network && <span style={{ fontSize: 9, color: network.color, background: network.color + "15", padding: "2px 6px", borderRadius: 4, display: "flex", alignItems: "center", gap: 3 }}><Globe size={9} /> {network.name}</span>}
              {msgCount > 0 && <span style={{ fontSize: 9, color: "#fbbf24", background: "rgba(251,191,36,0.1)", padding: "2px 6px", borderRadius: 4 }}>{msgCount} msgs</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { setActiveChannel(ch.id); setView("messages"); }} style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24", padding: "4px 10px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Message</button>
              <button onClick={() => removeChannel(ch.id)} style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "#71717a", padding: "4px 10px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}><X size={10} /></button>
            </div>
          </div>
        );
      })}

      <BulkActionBar
        count={bulk.count}
        total={channels.length}
        onSelectAll={() => bulk.selectAll(channels.map(c => c.id))}
        onClear={bulk.clearSelection}
        onDelete={handleBulkDelete}
        allSelected={bulk.isAllSelected(channels.map(c => c.id))}
        entityName="channel"
      />
    </div>
  );
}
