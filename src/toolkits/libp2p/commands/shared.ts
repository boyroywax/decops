/**
 * Shared args used by every libp2p command file.
 *
 * Extracted from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
export const NODE_ID_ARG = {
    name: "nodeId",
    type: "string" as const,
    description: "Local node id. Defaults to the currently-active node.",
    required: false,
};
