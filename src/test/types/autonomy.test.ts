import { describe, it, expect } from "vitest";
import {
  nextEscalation,
  DEFAULT_AUTONOMY_CONFIG,
} from "@/types/autonomy";
import type {
  EscalationLevel,
  TaskStatus,
  AgentTask,
  AutonomyConfig,
} from "@/types/autonomy";

describe("autonomy types", () => {
  describe("nextEscalation", () => {
    it("advances self → group", () => {
      expect(nextEscalation("self")).toBe("group");
    });

    it("advances group → network", () => {
      expect(nextEscalation("group")).toBe("network");
    });

    it("advances network → ecosystem", () => {
      expect(nextEscalation("network")).toBe("ecosystem");
    });

    it("returns null at ecosystem (top level)", () => {
      expect(nextEscalation("ecosystem")).toBeNull();
    });

    it("follows the complete chain self → group → network → ecosystem → null", () => {
      let level: EscalationLevel | null = "self";
      const chain: (EscalationLevel | null)[] = [level];
      while (level !== null) {
        level = nextEscalation(level);
        chain.push(level);
      }
      expect(chain).toEqual(["self", "group", "network", "ecosystem", null]);
    });
  });

  describe("DEFAULT_AUTONOMY_CONFIG", () => {
    it("has expected defaults", () => {
      expect(DEFAULT_AUTONOMY_CONFIG.maxRounds).toBe(12);
      expect(DEFAULT_AUTONOMY_CONFIG.maxEscalations).toBe(3);
      expect(DEFAULT_AUTONOMY_CONFIG.allowSubTasks).toBe(true);
      expect(DEFAULT_AUTONOMY_CONFIG.allowJobCreation).toBe(true);
      expect(DEFAULT_AUTONOMY_CONFIG.allowAgentCreation).toBe(true);
      expect(DEFAULT_AUTONOMY_CONFIG.autoExecuteConsensus).toBe(false);
      expect(DEFAULT_AUTONOMY_CONFIG.maxConcurrentSubTasks).toBe(4);
      expect(DEFAULT_AUTONOMY_CONFIG.taskTimeoutMs).toBe(5 * 60 * 1000);
    });
  });
});
