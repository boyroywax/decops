import type { ToolkitModule } from "@/services/toolkits/types";
import { cognitionCommands } from "./commands/cognition";

export const agentCognitionModule: ToolkitModule = {
  manifest: {
    id: "agent-cognition",
    name: "Agent Cognition",
    description:
      "Composable cognition mind-maps for agent intent analysis, planning, execution, feedback loops, and completion criteria.",
    icon: "Brain",
    color: "#14b8a6",
    gradient: ["#14b8a6", "#0ea5e9"],
    category: "ai",
    status: "available",
    builtIn: true,
    tags: ["cognition", "mind-map", "reasoning", "feedback-loop", "agent"],
    labels: { tier: "core", domain: "agent-cognition" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2026-06-03T00:00:00Z",
    updatedAt: "2026-06-03T00:00:00Z",
    dependencies: [
      { id: "jobs", version: "^1.0.0", minimumVersion: "1.0.0", recommendedVersion: "1.0.0", latestVersion: "1.0.0" },
      { id: "workspace-rag", version: "^1.0.0", minimumVersion: "1.0.0", recommendedVersion: "1.0.0", latestVersion: "1.0.0" },
    ],
  },
  commands: cognitionCommands,
  tools: [
    {
      id: "cognition.listProfiles",
      name: "List Cognition Profiles",
      description: "List available cognition mind-map profiles.",
      commandId: "cognition_list_profiles",
    },
    {
      id: "cognition.getProfile",
      name: "Get Cognition Profile",
      description: "Inspect one cognition profile manifest.",
      commandId: "cognition_get_profile",
    },
    {
      id: "cognition.upsertProfile",
      name: "Upsert Cognition Profile",
      description: "Create or update a cognition profile manifest.",
      commandId: "cognition_upsert_profile",
    },
    {
      id: "cognition.setAgentProfile",
      name: "Set Agent Cognition Profile",
      description: "Assign a cognition profile to an agent.",
      commandId: "cognition_set_agent_profile",
    },
    {
      id: "cognition.renderProtocol",
      name: "Render Cognition Protocol",
      description: "Render profile as executable prompt protocol text.",
      commandId: "cognition_render_protocol",
    },
  ],
  collections: [
    {
      id: "agent_cognition_profiles",
      name: "Agent Cognition Profiles",
      description: "Kubernetes-style manifests defining cognition nodes and feedback transitions for agents.",
      schema: [
        { name: "profileId", type: "string", required: true, unique: true, indexed: true },
        { name: "name", type: "string", required: true, indexed: true },
        { name: "mode", type: "string", required: true, indexed: true },
        { name: "strictLoop", type: "boolean", required: true },
        { name: "version", type: "string", required: true },
        { name: "updatedAt", type: "date", indexed: true },
      ],
      primaryKey: "profileId",
    },
  ],
  docs: {
    readme:
      "# Agent Cognition Toolkit\n\nDefine and manage reusable cognition mind-map manifests for agents. Profiles decouple thought loops from hard-coded prompts and allow per-agent reasoning strategies.",
    documents: [
      {
        id: "agent-cognition-overview",
        title: "Agent Cognition Overview",
        type: "readme",
        content:
          "Use cognition_upsert_profile to manage mind-map manifests, cognition_set_agent_profile to bind a profile to an agent, and cognition_render_protocol to inspect the generated protocol block.",
        order: 1,
      },
    ],
  },
  activity: { enabled: true },
};
