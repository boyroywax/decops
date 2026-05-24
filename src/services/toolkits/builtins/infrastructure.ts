/**
 * Channels & Messaging (infrastructure) toolkit module.
 */

import type { ToolkitModule } from "../types";
import { createChannelCommand } from "@/services/commands/definitions/channel";
import { createGroupCommand } from "@/services/commands/definitions/group";
import { sendMessageCommand } from "@/services/commands/definitions/messaging";
import { broadcastMessageCommand } from "@/services/commands/definitions/broadcast";
import {
  deleteChannelCommand,
  editChannelCommand,
  deleteGroupCommand,
  toggleGroupMemberCommand,
} from "@/services/commands/definitions/modification";
import {
  listChannelsCommand,
  listGroupsCommand,
  listMessagesCommand,
} from "@/services/commands/definitions/query";

export const infrastructureModule: ToolkitModule = {
  manifest: {
    id: "infrastructure",
    name: "Channels & Messaging",
    description:
      "Create channels and groups, send direct messages, broadcast to groups, and query message history.",
    icon: "ArrowLeftRight",
    color: "#a78bfa",
    gradient: ["#a78bfa", "#c084fc"],
    category: "infrastructure",
    status: "available",
    builtIn: true,
    tags: [
      "infrastructure",
      "channel",
      "group",
      "messaging",
      "interaction",
      "modification",
      "query",
    ],
    labels: { tier: "core", domain: "messaging" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    dependencies: [
      {
        id: "logging",
        version: "^2.0.0",
        minimumVersion: "2.0.0",
        recommendedVersion: "2.0.0",
        latestVersion: "2.0.0",
      },
    ],
  },
  commands: [
    createChannelCommand,
    deleteChannelCommand,
    editChannelCommand,
    createGroupCommand,
    deleteGroupCommand,
    toggleGroupMemberCommand,
    listChannelsCommand,
    listGroupsCommand,
    sendMessageCommand,
    broadcastMessageCommand,
    listMessagesCommand,
  ],
  // Curated direct LLM tools — the messaging hot path. Destructive /
  // membership ops (delete_*, toggle_group_member, edit_channel) stay
  // registry-only and route through create_job.
  tools: [
    {
      id: "infra.createChannel",
      name: "Create Channel",
      description: "Create a new communication channel.",
      commandId: "create_channel",
    },
    {
      id: "infra.createGroup",
      name: "Create Group",
      description: "Create a new agent group.",
      commandId: "create_group",
    },
    {
      id: "infra.sendMessage",
      name: "Send Message",
      description: "Send a message to a channel as an agent.",
      commandId: "send_message",
    },
    {
      id: "infra.broadcastMessage",
      name: "Broadcast Message",
      description: "Broadcast a message to every member of a group.",
      commandId: "broadcast_message",
    },
    {
      id: "infra.listGroups",
      name: "List Groups",
      description: "List every group in the workspace.",
      commandId: "list_groups",
    },
    {
      id: "infra.listMessages",
      name: "List Messages",
      description: "List recent messages in a channel.",
      commandId: "list_messages",
    },
  ],

  collections: [
    {
      id: "channels",
      name: "Channels",
      description: "Communication channels in the workspace.",
      schema: [
        { name: "id", type: "string", required: true, unique: true, indexed: true },
        { name: "name", type: "string", required: true },
        { name: "type", type: "enum", enumValues: ["public", "private", "direct"] },
        { name: "createdAt", type: "date" },
      ],
      primaryKey: "id",
    },
    {
      id: "messages",
      name: "Messages",
      description: "Message history across all channels.",
      schema: [
        { name: "id", type: "string", required: true, unique: true },
        { name: "channelId", type: "reference", referenceCollection: "channels", indexed: true },
        { name: "senderId", type: "string", required: true, indexed: true },
        { name: "content", type: "string", required: true },
        { name: "timestamp", type: "date", required: true },
      ],
      primaryKey: "id",
      retention: { maxEntries: 10000, policy: "fifo" },
    },
  ],

  logging: {
    config: { minLevel: "info", maxEntries: 500 },
    channels: [
      { id: "messaging.activity", name: "Messaging Activity", description: "Message send/receive events" },
    ],
  },

  notifications: {
    templates: [
      { id: "msg_mention", name: "Mention", description: "Notify when mentioned in a message", channel: "in-app", priority: "normal", event: "message.mention", template: "{{sender}} mentioned you in #{{channel}}: {{preview}}" },
      { id: "msg_broadcast", name: "Broadcast Received", description: "Notify on group broadcast", channel: "in-app", priority: "normal", event: "message.broadcast" },
    ],
    channels: ["in-app", "push"],
  },

  metrics: {
    definitions: [
      { name: "toolkit.channels.total", description: "Total channels in workspace", type: "gauge" },
      { name: "toolkit.groups.total", description: "Total groups in workspace", type: "gauge" },
      { name: "toolkit.messages.total", description: "Total messages sent (cumulative)", type: "counter" },
    ],
    collect: () => ({ "toolkit.channels.total": 0, "toolkit.groups.total": 0, "toolkit.messages.total": 0 }),
  },

  rbac: {
    permissions: [
      { id: "channels.create", name: "Create Channels", description: "Create new channels", resource: "channel", actions: ["create"] },
      { id: "channels.delete", name: "Delete Channels", description: "Delete channels", resource: "channel", actions: ["delete"] },
      { id: "messages.send", name: "Send Messages", description: "Send messages in channels", resource: "message", actions: ["create"] },
      { id: "messages.read", name: "Read Messages", description: "Read message history", resource: "message", actions: ["read"] },
    ],
    roles: [
      { id: "messaging-admin", name: "Messaging Admin", description: "Full messaging access", permissions: ["channels.create", "channels.delete", "messages.send", "messages.read"] },
      { id: "messaging-user", name: "Messaging User", description: "Send and read messages", permissions: ["messages.send", "messages.read"] },
    ],
    defaultRole: "messaging-user",
  },

  tests: {
    tests: [
      { id: "test_create_channel", name: "Create Channel", description: "Verify channel creation", type: "unit", commandId: "create_channel" },
      { id: "test_send_message", name: "Send Message", description: "Verify message sending", type: "unit", commandId: "send_message" },
    ],
  },

  docs: {
    documents: [
      { id: "infra-readme", title: "Channels & Messaging", type: "readme", content: "# Channels & Messaging\n\nCreate channels, groups, and send messages across the workspace.", order: 1 },
    ],
    readme: "# Channels & Messaging Kit\n\nProvides the messaging infrastructure for agent-to-agent and user-to-agent communication.",
  },

  activity: { enabled: true },
};
