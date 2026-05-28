/**
 * Ecosystem selection — represents which ecosystem feed the chat dialogue
 * area is currently rendering.
 *
 * Set when the user picks an item in the EcosystemPanel; null when the
 * dialogue area should fall back to the active LLM conversation.
 *
 * Chat-agent personas (the LLM bot themes like Architect/Code/etc.) are
 * NOT selected here — those are switched from the chat input bar. The
 * "agent-dm" kind below refers to a workspace ECOSYSTEM agent (an
 * identity in `workspace.agents`), showing all P2P / broadcast / bridge
 * traffic involving that agent.
 */
export type EcosystemSelection =
  | { kind: "overview" }
  | { kind: "p2p"; channelId: string }
  | { kind: "broadcast"; groupId: string }
  | { kind: "bridge"; bridgeId: string }
  | { kind: "agent-dm"; agentId: string };

export function ecosystemSelectionLabel(
  sel: EcosystemSelection,
  ctx: {
    channels: { id: string; from: string; to: string }[];
    groups: { id: string; name: string }[];
    bridges: { id: string; fromAgentId: string; toAgentId: string }[];
    agents: { id: string; name: string }[];
  },
): string {
  switch (sel.kind) {
    case "overview":
      return "Ecosystem overview";
    case "p2p": {
      const ch = ctx.channels.find((c) => c.id === sel.channelId);
      if (!ch) return "P2P channel";
      const from = ctx.agents.find((a) => a.id === ch.from)?.name ?? ch.from;
      const to = ctx.agents.find((a) => a.id === ch.to)?.name ?? ch.to;
      return `${from} ↔ ${to}`;
    }
    case "broadcast": {
      const g = ctx.groups.find((g) => g.id === sel.groupId);
      return g ? `Broadcast · ${g.name}` : "Broadcast";
    }
    case "bridge": {
      const b = ctx.bridges.find((b) => b.id === sel.bridgeId);
      if (!b) return "Bridge";
      const from = ctx.agents.find((a) => a.id === b.fromAgentId)?.name ?? "?";
      const to = ctx.agents.find((a) => a.id === b.toAgentId)?.name ?? "?";
      return `Bridge · ${from} → ${to}`;
    }
    case "agent-dm": {
      const a = ctx.agents.find((x) => x.id === sel.agentId);
      return a ? `DM · ${a.name}` : "Agent DM";
    }
  }
}
