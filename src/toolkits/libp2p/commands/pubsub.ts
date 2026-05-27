/**
 * libp2p gossipsub pubsub commands.
 *
 * Split from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandDefinition } from "@/services/commands/types";
import { libp2pService } from "../service";
import { NODE_ID_ARG } from "./shared";

export const libp2pPubsubSubscribeCommand: CommandDefinition = {
    id: "libp2p_pubsub_subscribe",
    description: "Subscribe to a gossipsub topic.",
    tags: ["libp2p", "pubsub"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        topic: { name: "topic", type: "string", description: "Topic name.", required: true },
    },
    output: "JSON confirming the subscription.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, topic } = args;
        if (!topic || typeof topic !== "string") throw new Error("topic is required");
        await libp2pService.subscribeTopic(topic, nodeId);
        return { topic, subscribed: true };
    },
};

export const libp2pPubsubUnsubscribeCommand: CommandDefinition = {
    id: "libp2p_pubsub_unsubscribe",
    description: "Unsubscribe from a gossipsub topic.",
    tags: ["libp2p", "pubsub"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        topic: { name: "topic", type: "string", description: "Topic name.", required: true },
    },
    output: "JSON confirming the unsubscribe.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, topic } = args;
        if (!topic || typeof topic !== "string") throw new Error("topic is required");
        await libp2pService.unsubscribeTopic(topic, nodeId);
        return { topic, subscribed: false };
    },
};

export const libp2pPubsubPublishCommand: CommandDefinition = {
    id: "libp2p_pubsub_publish",
    description: "Publish a message to a gossipsub topic.",
    tags: ["libp2p", "pubsub"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        topic: { name: "topic", type: "string", description: "Topic name.", required: true },
        message: { name: "message", type: "string", description: "Message body (UTF-8).", required: true },
    },
    output: "JSON confirming the publish.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, topic, message } = args;
        if (!topic || typeof topic !== "string") throw new Error("topic is required");
        if (typeof message !== "string") throw new Error("message is required");
        await libp2pService.publish(topic, message, nodeId);
        return { topic, published: true, bytes: message.length };
    },
};
