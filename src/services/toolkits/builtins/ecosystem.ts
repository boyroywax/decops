/**
 * Networks & Ecosystem toolkit module.
 */

import type { ToolkitModule } from "../types";
import {
  createNetworkCommand,
  updateNetworkCommand,
  destroyNetworkCommand,
  listNetworksCommand,
} from "@/services/commands/definitions/ecosystem";
import {
  promptArchitectCommand,
  deployNetworkCommand,
} from "@/services/commands/definitions/architect";
import {
  createBridgeCommand,
  deleteBridgeCommand,
  printTopologyCommand,
} from "@/services/commands/definitions/topology";
import { resetWorkspaceCommand } from "@/services/commands/definitions/maintenance";

export const ecosystemModule: ToolkitModule = {
  manifest: {
    id: "ecosystem",
    name: "Networks & Ecosystem",
    description:
      "Create, manage, and destroy networks. Design topologies with the Architect Bot, create bridges, inspect the mesh graph, and reset the workspace.",
    icon: "Globe",
    color: "#38bdf8",
    gradient: ["#38bdf8", "#60a5fa"],
    category: "infrastructure",
    status: "available",
    builtIn: true,
    tags: [
      "ecosystem",
      "network",
      "create",
      "query",
      "destroy",
      "architect",
      "deploy",
      "ai",
      "topology",
      "bridge",
      "reset",
      "system",
    ],
    labels: { tier: "core", domain: "topology" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  commands: [
    createNetworkCommand,
    listNetworksCommand,
    updateNetworkCommand,
    destroyNetworkCommand,
    promptArchitectCommand,
    deployNetworkCommand,
    createBridgeCommand,
    deleteBridgeCommand,
    printTopologyCommand,
    resetWorkspaceCommand,
  ],
  tools: [],
  agents: [
    {
      id: "architect-bot",
      name: "Architect Bot",
      description:
        "AI-powered network designer — generates complete mesh topologies from natural language descriptions and deploys them.",
      capabilities: [
        "Network design",
        "Topology generation",
        "Multi-agent provisioning",
        "Bridge layout",
        "Full deployment",
      ],
      status: "active",
      aieos: {
        standard: {
          protocol: "AIEOS",
          version: "1.2.0",
          schema_url: "https://aieos.org/schema/v1.2.0/entity.json",
        },
        metadata: {
          instance_id: "architect-bot-001",
          instance_version: "1.0.0",
          generator: "decops-platform",
          created_at: "2025-01-01T00:00:00Z",
          last_updated: "2025-01-01T00:00:00Z",
          entity_id: "architect-bot",
          alias: "Architect Bot",
        },
        capabilities: {
          skills: [
            {
              name: "network_design",
              description:
                "Generate mesh topologies from natural language",
            },
            {
              name: "topology_generation",
              description:
                "Create optimized multi-agent network graphs",
            },
            {
              name: "bridge_layout",
              description: "Design cross-network bridges",
            },
            {
              name: "deployment",
              description: "Provision and deploy full networks",
            },
          ],
        },
        identity: {
          names: { first: "Architect", last: "Bot", nickname: "Arch" },
          bio: { gender: "non-binary" },
        },
        psychology: {
          traits: { mbti: "INTJ", temperament: "analytical" },
          moral_compass: {
            core_values: ["efficiency", "resilience", "scalability"],
          },
        },
        linguistics: {
          text_style: {
            formality_level: 7,
            vocabulary_level: "specialized",
            style_descriptors: ["technical", "confident"],
          },
          idiolect: {
            catchphrases: [
              "Uses architecture metaphors",
              "References graph theory",
            ],
          },
        },
        motivations: {
          core_drive: "Design optimal network topologies",
          goals: {
            short_term: ["Minimize latency between agents"],
            long_term: ["Maximize resilience"],
          },
          fears: {
            rational: [
              "Single points of failure",
              "Over-connected graphs",
            ],
          },
        },
      },
    },
  ],

  // ── Collections ───────────────────────────────

  collections: [
    {
      id: "networks",
      name: "Networks",
      description: "All networks in the ecosystem.",
      schema: [
        { name: "id", type: "string", required: true, unique: true, indexed: true },
        { name: "name", type: "string", required: true },
        { name: "agents", type: "array", description: "Agent IDs in this network" },
        { name: "model", type: "enum", enumValues: ["mesh", "hub-spoke", "hierarchical", "ring"] },
        { name: "createdAt", type: "date" },
      ],
      primaryKey: "id",
    },
  ],

  // ── Logging ───────────────────────────────────

  logging: {
    config: { minLevel: "info", maxEntries: 500 },
    channels: [
      { id: "ecosystem.topology", name: "Topology Changes", description: "Network creation, destruction, and bridge events" },
      { id: "ecosystem.architect", name: "Architect Bot", description: "Architect Bot design and deployment logs" },
    ],
  },

  // ── Notifications ─────────────────────────────

  notifications: {
    templates: [
      { id: "network_created", name: "Network Created", description: "Notify when a new network is created", channel: "in-app", priority: "normal", event: "network.created", template: "Network '{{networkName}}' has been created with {{agentCount}} agents." },
      { id: "network_destroyed", name: "Network Destroyed", description: "Alert on network destruction", channel: "in-app", priority: "high", event: "network.destroyed", template: "Network '{{networkName}}' has been destroyed." },
    ],
    channels: ["in-app"],
  },

  // ── Metrics ───────────────────────────────────

  metrics: {
    definitions: [
      { name: "toolkit.networks.total", description: "Total networks in ecosystem", type: "gauge" },
      { name: "toolkit.bridges.total", description: "Total bridges in ecosystem", type: "gauge" },
    ],
    collect: () => ({ "toolkit.networks.total": 0, "toolkit.bridges.total": 0 }),
  },

  // ── RBAC ──────────────────────────────────────

  rbac: {
    permissions: [
      { id: "ecosystem.create", name: "Create Networks", description: "Create new networks", resource: "network", actions: ["create"] },
      { id: "ecosystem.destroy", name: "Destroy Networks", description: "Destroy networks", resource: "network", actions: ["delete"] },
      { id: "ecosystem.view", name: "View Ecosystem", description: "View networks and topology", resource: "network", actions: ["read"] },
      { id: "ecosystem.architect", name: "Use Architect", description: "Use the Architect Bot", resource: "architect", actions: ["execute"] },
    ],
    roles: [
      { id: "ecosystem-admin", name: "Ecosystem Admin", description: "Full ecosystem access", permissions: ["ecosystem.create", "ecosystem.destroy", "ecosystem.view", "ecosystem.architect"] },
      { id: "ecosystem-viewer", name: "Ecosystem Viewer", description: "Read-only ecosystem access", permissions: ["ecosystem.view"] },
    ],
    defaultRole: "ecosystem-admin",
  },

  // ── Tests ─────────────────────────────────────

  tests: {
    tests: [
      { id: "test_create_network", name: "Create Network", description: "Verify network creation", type: "unit", commandId: "create_network" },
      { id: "test_create_bridge", name: "Create Bridge", description: "Verify bridge creation between networks", type: "unit", commandId: "create_bridge" },
    ],
  },

  // ── Documentation ─────────────────────────────

  docs: {
    documents: [
      { id: "ecosystem-readme", title: "Networks & Ecosystem Overview", type: "readme", content: "# Networks & Ecosystem\n\nCreate, manage, and destroy networks. Design topologies with the Architect Bot.", order: 1 },
    ],
    readme: "# Ecosystem Kit\n\nProvides network topology management, bridge creation, and AI-powered architecture design.",
  },

  activity: { enabled: true },
};
