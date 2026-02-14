import type { Agent, Channel, Message, ChannelForm, ViewId } from "../../types";
import { ROLES, CHANNEL_TYPES } from "../../constants";
import { inputStyle, SectionTitle, PillButton } from "../shared/ui";

interface ChannelsViewProps {
  agents: Agent[];
  channels: Channel[];
  messages: Message[];
  channelForm: ChannelForm;
  setChannelForm: (v: ChannelForm) => void;
  createChannel: () => void;
  removeChannel: (id: string) => void;
  setActiveChannel: (id: string) => void;
  setView: (v: ViewId) => void;
}

export function ChannelsView({
  agents, channels, messages,
  channelForm, setChannelForm,
  createChannel, removeChannel, setActiveChannel, setView,
}: ChannelsViewProps) {
  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, marginBottom: 20 }}>P2P Channels</h2>

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
            <span style={{ color: "#52525b" }}>⟷</span>
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
        if (!from || !to) return null;
        return (
          <div key={ch.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
              <span style={{ color: ROLES.find(r => r.id === from.role)?.color }}>{from.name}</span>
              <span style={{ color: "#52525b" }}>⟷</span>
              <span style={{ color: ROLES.find(r => r.id === to.role)?.color }}>{to.name}</span>
              <span style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa", padding: "3px 8px", borderRadius: 4, fontSize: 10 }}>{cType?.icon} {cType?.label}</span>
              {msgCount > 0 && <span style={{ fontSize: 9, color: "#fbbf24", background: "rgba(251,191,36,0.1)", padding: "2px 6px", borderRadius: 4 }}>{msgCount} msgs</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { setActiveChannel(ch.id); setView("messages"); }} style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24", padding: "4px 10px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Message</button>
              <button onClick={() => removeChannel(ch.id)} style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "#71717a", padding: "4px 10px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
