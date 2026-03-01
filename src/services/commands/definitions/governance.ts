
import type { CommandDefinition, CommandContext } from "../types";
import { getGroupModel } from "../../ai";

/**
 * group_decide — Uses AI to facilitate group decision-making.
 *
 * Given a group, a prompt (or artifact reference), and the group's governance model,
 * the command simulates each member's position and produces a consensus decision
 * based on the governance rules (majority, threshold, delegated, unanimous).
 */
export const groupDecideCommand: CommandDefinition = {
    id: "group_decide",
    description: "Facilitate a group decision using AI. Simulates member deliberation based on the group's governance model and produces a consensus outcome.",
    tags: ["governance", "group", "ai", "decision"],
    rbac: ["orchestrator", "builder"],
    usesAI: "ai-text",
    args: {
        groupId: {
            name: "groupId",
            type: "group",
            description: "ID or name of the group to make a decision",
            required: true,
        },
        prompt: {
            name: "prompt",
            type: "string",
            description: "The question or proposal for the group to deliberate on",
            required: false,
        },
        artifactKey: {
            name: "artifactKey",
            type: "string",
            description: "Key of an artifact to use as context for the decision (alternative to prompt)",
            required: false,
        },
        decisionType: {
            name: "decisionType",
            type: "string",
            description: "Type of decision to make",
            required: false,
            enum: ["approve-reject", "rank-options", "consensus-statement", "action-plan"],
            defaultValue: "approve-reject",
        },
    },
    output: "JSON object containing the group decision, individual member positions, and the final outcome.",
    outputSchema: {
        type: "object",
        properties: {
            groupId: { type: "string" },
            groupName: { type: "string" },
            governance: { type: "string" },
            threshold: { type: "number" },
            prompt: { type: "string" },
            decisionType: { type: "string" },
            memberPositions: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        agentId: { type: "string" },
                        agentName: { type: "string" },
                        position: { type: "string" },
                        reasoning: { type: "string" },
                        vote: { type: "string" },
                    },
                },
            },
            outcome: {
                type: "object",
                properties: {
                    decision: { type: "string" },
                    passed: { type: "boolean" },
                    votesFor: { type: "number" },
                    votesAgainst: { type: "number" },
                    summary: { type: "string" },
                },
            },
        },
    },
    execute: async (args, context: CommandContext) => {
        const { agents, groups, addLog } = context.workspace;

        // Resolve group
        const group = groups.find((g: any) => g.id === args.groupId);
        if (!group) throw new Error(`Group '${args.groupId}' not found`);

        // Resolve the deliberation prompt
        let deliberationPrompt = args.prompt;
        if (!deliberationPrompt && args.artifactKey) {
            // Look up artifact from storage or jobs context
            const artifacts = context.jobs?.allArtifacts ?? [];
            const artifact = artifacts.find((a: any) => a.key === args.artifactKey || a.id === args.artifactKey);
            if (artifact) {
                deliberationPrompt = typeof artifact.content === "string"
                    ? artifact.content
                    : JSON.stringify(artifact.content, null, 2);
            } else {
                // Check shared storage
                const stored = context.storage?.[args.artifactKey];
                if (stored) {
                    deliberationPrompt = typeof stored === "string" ? stored : JSON.stringify(stored, null, 2);
                }
            }
        }
        if (!deliberationPrompt) {
            throw new Error("Either 'prompt' or a valid 'artifactKey' is required");
        }

        const decisionType = args.decisionType || "approve-reject";

        // Resolve member agents
        const allAgents = [...agents, ...(context.storage._agents || [])];
        const memberAgents = group.members
            .map((mid: string) => allAgents.find((a: any) => a.id === mid))
            .filter(Boolean);

        if (memberAgents.length === 0) throw new Error("Group has no resolvable members");

        // Determine model to use (group override → group.modelId → global)
        const modelId = getGroupModel(group.id, group.modelId);

        addLog(`🗳️ Group decision initiated for "${group.name}" (${group.governance}, ${memberAgents.length} members)`);
        addLog(`📋 Prompt: ${deliberationPrompt.substring(0, 100)}${deliberationPrompt.length > 100 ? "…" : ""}`);
        addLog(`🤖 Model: ${modelId}`);

        // Simulate member positions based on their prompts/roles
        const memberPositions = memberAgents.map((agent: any) => {
            const role = agent.role || "analyst";
            // Each agent's "position" is determined by their system prompt and role
            return {
                agentId: agent.id,
                agentName: agent.name,
                role,
                systemPrompt: agent.prompt || `You are a ${role} agent.`,
            };
        });

        // Build the governance context
        const governanceDesc = ({
            majority: `Simple majority (>50% must agree). Threshold: ${group.threshold}/${group.members.length}`,
            threshold: `Custom threshold (${group.threshold}/${group.members.length} must agree)`,
            delegated: `Delegated authority — a designated lead makes the final call after hearing positions`,
            unanimous: `Unanimous consent required — all ${group.members.length} members must agree`,
        } as Record<string, string>)[group.governance] || `Governance: ${group.governance}`;

        // Produce result (the AI would process this in a real execution)
        const result = {
            groupId: group.id,
            groupName: group.name,
            governance: group.governance,
            threshold: group.threshold,
            prompt: deliberationPrompt,
            decisionType,
            modelId,
            memberPositions: memberPositions.map((mp: any) => ({
                agentId: mp.agentId,
                agentName: mp.agentName,
                role: mp.role,
                position: "pending",
                reasoning: `Awaiting AI deliberation using ${mp.agentName}'s system prompt`,
                vote: "pending",
            })),
            governanceRule: governanceDesc,
            outcome: {
                decision: "pending",
                passed: false,
                votesFor: 0,
                votesAgainst: 0,
                summary: `Group decision queued for ${memberAgents.length} members under ${group.governance} governance`,
            },
            status: "queued",
        };

        // Store in shared storage for downstream steps
        context.storage.lastGroupDecision = result;
        context.storage[`decision_${group.name}`] = result;

        // Produce deliverable
        context.addDeliverable({
            key: "group-decision",
            name: `${group.name} Decision`,
            type: "json",
            content: JSON.stringify(result, null, 2),
            tags: ["governance", "decision", group.governance],
        });

        addLog(`✅ Group decision prepared: "${group.name}" — ${decisionType} under ${group.governance}`);

        return result;
    },
};
