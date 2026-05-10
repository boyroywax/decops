import { describe, it, expect, beforeEach } from "vitest";
import { useEcosystemStore } from "@/stores/ecosystemStore";
import type { Network, Bridge, BridgeMessage } from "@/types";
import { act } from "@testing-library/react";

function makeNetwork(overrides: Partial<Network> = {}): Network {
  return {
    id: crypto.randomUUID(),
    name: "TestNetwork",
    did: "did:test:net",
    color: "#00e5a0",
    agents: [],
    channels: [],
    groups: [],
    messages: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeBridge(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: crypto.randomUUID(),
    fromNetworkId: "n1",
    toNetworkId: "n2",
    fromAgentId: "a1",
    toAgentId: "a2",
    type: "data",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Bridge;
}

describe("ecosystemStore", () => {
  beforeEach(() => {
    useEcosystemStore.getState().resetEcosystem();
  });

  describe("network management", () => {
    it("starts with empty networks", () => {
      expect(useEcosystemStore.getState().ecosystem.networks).toHaveLength(0);
    });

    it("addNetwork adds a network", () => {
      const net = makeNetwork({ id: "n1", name: "Alpha" });
      act(() => useEcosystemStore.getState().addNetwork(net));
      expect(useEcosystemStore.getState().ecosystem.networks).toHaveLength(1);
      expect(useEcosystemStore.getState().ecosystem.networks[0].name).toBe("Alpha");
    });

    it("updateNetwork patches a network", () => {
      const net = makeNetwork({ id: "n1", name: "Alpha" });
      act(() => useEcosystemStore.getState().addNetwork(net));
      act(() => useEcosystemStore.getState().updateNetwork("n1", { name: "Beta", color: "#ff0000" }));

      const updated = useEcosystemStore.getState().ecosystem.networks[0];
      expect(updated.name).toBe("Beta");
      expect(updated.color).toBe("#ff0000");
    });

    it("removeNetwork removes network and associated bridges", () => {
      const n1 = makeNetwork({ id: "n1" });
      const n2 = makeNetwork({ id: "n2" });
      const bridge = makeBridge({ id: "b1", fromNetworkId: "n1", toNetworkId: "n2" });

      act(() => {
        useEcosystemStore.getState().addNetwork(n1);
        useEcosystemStore.getState().addNetwork(n2);
        useEcosystemStore.getState().addBridge(bridge);
      });

      expect(useEcosystemStore.getState().ecosystem.bridges).toHaveLength(1);
      act(() => useEcosystemStore.getState().removeNetwork("n1"));

      expect(useEcosystemStore.getState().ecosystem.networks).toHaveLength(1);
      expect(useEcosystemStore.getState().ecosystem.bridges).toHaveLength(0); // cascade
    });

    it("removeNetwork clears activeNetworkId if it was the removed network", () => {
      const net = makeNetwork({ id: "n1" });
      act(() => {
        useEcosystemStore.getState().addNetwork(net);
        useEcosystemStore.getState().setActiveNetworkId("n1");
      });
      expect(useEcosystemStore.getState().activeNetworkId).toBe("n1");

      act(() => useEcosystemStore.getState().removeNetwork("n1"));
      expect(useEcosystemStore.getState().activeNetworkId).toBeNull();
    });

    it("setNetworks with updater function", () => {
      const n1 = makeNetwork({ id: "n1" });
      act(() => useEcosystemStore.getState().addNetwork(n1));

      const n2 = makeNetwork({ id: "n2" });
      act(() => useEcosystemStore.getState().setNetworks((prev) => [...prev, n2]));
      expect(useEcosystemStore.getState().ecosystem.networks).toHaveLength(2);
    });
  });

  describe("bridge management", () => {
    it("addBridge and removeBridge", () => {
      const bridge = makeBridge({ id: "b1" });
      act(() => useEcosystemStore.getState().addBridge(bridge));
      expect(useEcosystemStore.getState().ecosystem.bridges).toHaveLength(1);

      act(() => useEcosystemStore.getState().removeBridge("b1"));
      expect(useEcosystemStore.getState().ecosystem.bridges).toHaveLength(0);
    });
  });

  describe("bridge messages", () => {
    it("adds bridge messages", () => {
      const msg: BridgeMessage = {
        id: "bm1",
        bridgeId: "b1",
        fromId: "a1",
        toId: "a2",
        content: "cross-network msg",
        response: null,
        status: "delivered",
        ts: Date.now(),
      };
      act(() => useEcosystemStore.getState().addBridgeMessage(msg));
      expect(useEcosystemStore.getState().ecosystem.bridgeMessages).toHaveLength(1);
    });
  });

  describe("active network", () => {
    it("setActiveNetworkId and activeNetworkId", () => {
      act(() => useEcosystemStore.getState().setActiveNetworkId("n1"));
      expect(useEcosystemStore.getState().activeNetworkId).toBe("n1");

      act(() => useEcosystemStore.getState().setActiveNetworkId(null));
      expect(useEcosystemStore.getState().activeNetworkId).toBeNull();
    });
  });

  describe("resetEcosystem", () => {
    it("resets to default state", () => {
      act(() => {
        useEcosystemStore.getState().addNetwork(makeNetwork());
        useEcosystemStore.getState().addBridge(makeBridge());
        useEcosystemStore.getState().setActiveNetworkId("n1");
      });

      act(() => useEcosystemStore.getState().resetEcosystem());
      const s = useEcosystemStore.getState();
      expect(s.ecosystem.networks).toHaveLength(0);
      expect(s.ecosystem.bridges).toHaveLength(0);
      expect(s.activeNetworkId).toBeNull();
    });
  });
});
