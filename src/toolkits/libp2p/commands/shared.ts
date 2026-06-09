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

/**
 * Common command-arg shape: a dynamic bag plus the optional `nodeId`.
 *
 * Declared as an interface (not an intersection) so direct member access
 * `args.nodeId` resolves to the explicit `string | undefined` rather than the
 * index signature's `unknown`. Other keys are read as `unknown` and narrowed
 * with `typeof` / `String()` at the use site.
 */
export interface Libp2pNodeArgs {
    nodeId?: string;
    [key: string]: unknown;
}
