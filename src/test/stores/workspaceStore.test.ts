import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { Agent, Channel, Group, Message } from "@/types";
import { act } from "@testing-library/react";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: crypto.randomUUID(),
    name: "TestAgent",
    role: "researcher",
    prompt: "",
    did: "did:test:agent",
    keys: { publicKey: "pk", privateKey: "sk" },
    createdAt: new Date().toISOString(),
    status: "active",
    ...overrides,
  } as Agent;
}

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: crypto.randomUUID(),
    from: "a1",
    to: "a2",
    type: "data",
    offset: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Channel;
}

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: crypto.randomUUID(),
    name: "TestGroup",
    governance: "majority",
    members: ["a1", "a2"],
    threshold: 2,
    did: "did:test:group",
    color: "#00e5a0",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Group;
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: crypto.randomUUID(),
    fromId: "a1",
    toId: "a2",
    content: "hello",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Message;
}

describe("workspaceStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useWorkspaceStore.setState({
      agents: [],
      channels: [],
      groups: [],
      messages: [],
    });
  });

  describe("entity CRUD", () => {
    it("adds and removes agents", () => {
      const agent = makeAgent({ id: "a1", name: "Lead" });
      act(() => useWorkspaceStore.getState().addAgent(agent));

      expect(useWorkspaceStore.getState().agents).toHaveLength(1);
      expect(useWorkspaceStore.getState().agents[0].name).toBe("Lead");

      act(() => useWorkspaceStore.getState().removeAgent("a1"));
      expect(useWorkspaceStore.getState().agents).toHaveLength(0);
    });

    it("adds and removes channels", () => {
      const ch = makeChannel({ id: "ch1" });
      act(() => useWorkspaceStore.getState().addChannel(ch));
      expect(useWorkspaceStore.getState().channels).toHaveLength(1);

      act(() => useWorkspaceStore.getState().removeChannel("ch1"));
      expect(useWorkspaceStore.getState().channels).toHaveLength(0);
    });

    it("adds and removes groups", () => {
      const g = makeGroup({ id: "g1" });
      act(() => useWorkspaceStore.getState().addGroup(g));
      expect(useWorkspaceStore.getState().groups).toHaveLength(1);

      act(() => useWorkspaceStore.getState().removeGroup("g1"));
      expect(useWorkspaceStore.getState().groups).toHaveLength(0);
    });

    it("adds and removes messages", () => {
      const m = makeMessage({ id: "m1" });
      act(() => useWorkspaceStore.getState().addMessage(m));
      expect(useWorkspaceStore.getState().messages).toHaveLength(1);

      act(() => useWorkspaceStore.getState().removeMessage("m1"));
      expect(useWorkspaceStore.getState().messages).toHaveLength(0);
    });
  });

  describe("setters (React setState–compatible)", () => {
    it("setAgents with value", () => {
      const agents = [makeAgent({ id: "a1" }), makeAgent({ id: "a2" })];
      act(() => useWorkspaceStore.getState().setAgents(agents));
      expect(useWorkspaceStore.getState().agents).toHaveLength(2);
    });

    it("setAgents with updater function", () => {
      const a1 = makeAgent({ id: "a1" });
      act(() => useWorkspaceStore.getState().setAgents([a1]));

      const a2 = makeAgent({ id: "a2" });
      act(() => useWorkspaceStore.getState().setAgents((prev) => [...prev, a2]));
      expect(useWorkspaceStore.getState().agents).toHaveLength(2);
    });

    it("setChannels with updater function", () => {
      const ch1 = makeChannel({ id: "ch1" });
      const ch2 = makeChannel({ id: "ch2" });
      act(() => useWorkspaceStore.getState().setChannels([ch1]));
      act(() => useWorkspaceStore.getState().setChannels((prev) => [...prev, ch2]));
      expect(useWorkspaceStore.getState().channels).toHaveLength(2);
    });
  });

  describe("bulk operations", () => {
    it("clearWorkspace empties all arrays", () => {
      act(() => {
        useWorkspaceStore.getState().addAgent(makeAgent());
        useWorkspaceStore.getState().addChannel(makeChannel());
        useWorkspaceStore.getState().addGroup(makeGroup());
        useWorkspaceStore.getState().addMessage(makeMessage());
      });
      expect(useWorkspaceStore.getState().agents.length).toBeGreaterThan(0);

      act(() => useWorkspaceStore.getState().clearWorkspace());
      const s = useWorkspaceStore.getState();
      expect(s.agents).toHaveLength(0);
      expect(s.channels).toHaveLength(0);
      expect(s.groups).toHaveLength(0);
      expect(s.messages).toHaveLength(0);
    });

    it("importWorkspace replaces state", () => {
      const agents = [makeAgent({ id: "a1" })];
      const channels = [makeChannel({ id: "ch1" })];
      act(() => useWorkspaceStore.getState().importWorkspace({ agents, channels }));

      expect(useWorkspaceStore.getState().agents).toHaveLength(1);
      expect(useWorkspaceStore.getState().channels).toHaveLength(1);
      expect(useWorkspaceStore.getState().groups).toHaveLength(0); // untouched
    });

    it("exportWorkspace returns current state", () => {
      const agent = makeAgent({ id: "a1" });
      act(() => useWorkspaceStore.getState().addAgent(agent));

      const exported = useWorkspaceStore.getState().exportWorkspace();
      expect(exported.agents).toHaveLength(1);
      expect(exported.agents[0].id).toBe("a1");
    });
  });

  describe("unread management", () => {
    it("marks messages as read", () => {
      const m1 = makeMessage({ id: "m1" });
      const m2 = makeMessage({ id: "m2" });
      act(() => {
        useWorkspaceStore.getState().addMessage(m1);
        useWorkspaceStore.getState().addMessage(m2);
      });

      act(() => useWorkspaceStore.getState().markAsRead(["m1"]));
      const msgs = useWorkspaceStore.getState().messages;
      expect(msgs.find((m) => m.id === "m1")?.readAt).toBeDefined();
      expect(msgs.find((m) => m.id === "m2")?.readAt).toBeUndefined();
    });

    it("markChannelRead marks all messages in a channel", () => {
      const ch = makeChannel({ id: "ch1", from: "a1", to: "a2" });
      const m1 = makeMessage({ id: "m1", fromId: "a1", toId: "a2" });
      const m2 = makeMessage({ id: "m2", fromId: "a2", toId: "a1" }); // reverse direction
      const m3 = makeMessage({ id: "m3", fromId: "a3", toId: "a4" }); // different channel
      act(() => {
        useWorkspaceStore.getState().addMessage(m1);
        useWorkspaceStore.getState().addMessage(m2);
        useWorkspaceStore.getState().addMessage(m3);
      });

      act(() => useWorkspaceStore.getState().markChannelRead("ch1", [ch]));
      const msgs = useWorkspaceStore.getState().messages;
      expect(msgs.find((m) => m.id === "m1")?.readAt).toBeDefined();
      expect(msgs.find((m) => m.id === "m2")?.readAt).toBeDefined();
      expect(msgs.find((m) => m.id === "m3")?.readAt).toBeUndefined();
    });
  });
});
