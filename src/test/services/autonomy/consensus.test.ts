import { describe, it, expect, vi, beforeEach } from "vitest";
import { tallyVotes, buildAgentProposal, buildWorkflowProposal, buildEcosystemProposal } from "@/services/autonomy/consensus";
import type { MemberPosition, ConsensusOutcome } from "@/types/autonomy";

describe("consensus", () => {
  describe("tallyVotes", () => {
    const makePosition = (vote: "approve" | "reject" | "abstain"): MemberPosition => ({
      agentId: `agent-${Math.random()}`,
      agentName: "Test",
      vote,
      reasoning: "test reasoning",
    });

    it("approves with majority governance (>50%)", () => {
      const positions = [
        makePosition("approve"),
        makePosition("approve"),
        makePosition("reject"),
      ];
      const outcome = tallyVotes(positions, "majority", 0.5, 3);
      expect(outcome.passed).toBe(true);
      expect(outcome.decision).toContain("Approved");
      expect(outcome.votesFor).toBe(2);
      expect(outcome.votesAgainst).toBe(1);
    });

    it("rejects when majority not met", () => {
      const positions = [
        makePosition("reject"),
        makePosition("reject"),
        makePosition("approve"),
      ];
      const outcome = tallyVotes(positions, "majority", 0.5, 3);
      expect(outcome.passed).toBe(false);
      expect(outcome.decision).toContain("Rejected");
    });

    it("handles threshold governance", () => {
      const positions = [
        makePosition("approve"),
        makePosition("approve"),
        makePosition("approve"),
        makePosition("reject"),
      ];
      // threshold mode: passed = votesFor >= threshold. threshold=0.75 so need >= 0.75 votes (3 >= 0.75 => true)
      const outcome = tallyVotes(positions, "threshold", 0.75, 4);
      expect(outcome.passed).toBe(true);
      expect(outcome.votesFor).toBe(3);
    });

    it("rejects when threshold not met", () => {
      const positions = [
        makePosition("approve"),
        makePosition("approve"),
        makePosition("reject"),
        makePosition("reject"),
      ];
      // threshold=3 — need 3 approves, only have 2
      const outcome = tallyVotes(positions, "threshold", 3, 4);
      expect(outcome.passed).toBe(false);
    });

    it("handles unanimous governance", () => {
      const positions = [
        makePosition("approve"),
        makePosition("approve"),
        makePosition("approve"),
      ];
      const outcome = tallyVotes(positions, "unanimous", 1, 3);
      expect(outcome.passed).toBe(true);
      expect(outcome.decision).toContain("Unanimously");
    });

    it("rejects unanimous when any reject", () => {
      const positions = [
        makePosition("approve"),
        makePosition("approve"),
        makePosition("reject"),
      ];
      const outcome = tallyVotes(positions, "unanimous", 1, 3);
      expect(outcome.passed).toBe(false);
      expect(outcome.decision).toContain("Not unanimous");
    });

    it("counts abstentions separately", () => {
      const positions = [
        makePosition("approve"),
        makePosition("abstain"),
        makePosition("abstain"),
      ];
      const outcome = tallyVotes(positions, "majority", 0.5, 3);
      expect(outcome.abstentions).toBe(2);
    });

    it("defaults to majority for unknown governance", () => {
      const positions = [
        makePosition("approve"),
        makePosition("approve"),
        makePosition("reject"),
      ];
      const outcome = tallyVotes(positions, "custom_model", 0.5, 3);
      expect(outcome.passed).toBe(true);
    });
  });

  describe("buildAgentProposal", () => {
    it("creates a well-formed agent proposal", () => {
      const proposal = buildAgentProposal(
        "agent-proposer",
        "g-1",
        {
          name: "Data Analyst",
          role: "researcher",
          prompt: "You analyze data patterns",
          title: "Senior Data Analyst",
          capabilities: ["data-analysis", "statistics"],
          justification: "We need someone to handle data work",
        },
      );

      expect(proposal.kind).toBe("create_agent");
      expect(proposal.groupId).toBe("g-1");
      expect(proposal.proposedBy).toBe("agent-proposer");
      expect((proposal.spec as any).name).toBe("Data Analyst");
      expect(proposal.description).toBe("We need someone to handle data work");
      expect(proposal.positions).toEqual([]);
      expect(proposal.executed).toBe(false);
    });
  });

  describe("buildWorkflowProposal", () => {
    it("creates a well-formed workflow proposal", () => {
      const proposal = buildWorkflowProposal(
        "agent-1",
        "g-2",
        {
          name: "Data Pipeline",
          description: "Process incoming data",
          steps: [
            { commandId: "create_artifact", args: { type: "report" }, reasoning: "Create report artifact" },
          ],
        },
      );

      expect(proposal.kind).toBe("create_workflow");
      expect((proposal.spec as any).name).toBe("Data Pipeline");
      expect(proposal.executed).toBe(false);
    });
  });

  describe("buildEcosystemProposal", () => {
    it("creates a well-formed ecosystem change proposal", () => {
      const proposal = buildEcosystemProposal(
        "agent-2",
        "g-3",
        {
          changeType: "add_network",
          description: "Add analytics network",
          entities: { name: "Analytics Net" },
          justification: "Scale analytics capabilities",
        },
      );

      expect(proposal.kind).toBe("ecosystem_change");
      expect((proposal.spec as any).changeType).toBe("add_network");
      expect(proposal.executed).toBe(false);
    });
  });
});
