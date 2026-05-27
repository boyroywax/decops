/**
 * Ecosystem selection — represents which ecosystem feed the chat dialogue
 * area is currently rendering.
 *
 * Set when the user picks an item in the EcosystemPanel; null when the
 * dialogue area should fall back to the active LLM conversation.
 *
 * AI agent DMs intentionally don't appear here — selecting an AI agent
 * just calls `useChatAgentsStore.setActive(id)` and keeps the regular
 * conversation rendering path.
 */
export type EcosystemSelection =
  | { kind: "overview" }
  | { kind: "p2p"; channelId: string }
  | { kind: "broadcast"; groupId: string }
  | { kind: "bridge"; bridgeId: string };

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
  }
}
