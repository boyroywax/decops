/**
 * Autonomy service — autonomous agent task execution, delegation,
 * group consensus, and ecosystem ideation.
 *
 * @module services/autonomy
 */

// Task engine
export {
  createTask,
  executeTask,
  getTask,
  getAllTasks,
  clearTasks,
} from "./taskEngine";

// Planning
export { generatePlan } from "./planner";

// Task-level AI chat
export { chatDuringTask } from "./taskChat";
export type { TaskChatMessage, TaskChatResult } from "./taskChat";

// Delegation
export {
  findDelegationTarget,
  buildDelegationRequest,
  delegationEvent,
  escalationEvent,
} from "./delegation";

// Capability assessment
export {
  assessAgent,
  rankAgentsForGoal,
  findBestGroupMember,
  identifyGaps,
} from "./capability";

// Group consensus
export {
  deliberate,
  tallyVotes,
  buildAgentProposal,
  buildWorkflowProposal,
  buildEcosystemProposal,
} from "./consensus";

// Ecosystem ideation
export { runIdeationSession } from "./ideation";
export type { IdeationRequest, IdeationResult } from "./ideation";
