/**
 * Navigator Toolkit module — registers commands + manifest with the
 * toolkit registry. Mirrors `orchestratorModule`.
 */
import type { ToolkitModule } from "@/services/toolkits/types";
import { navigatorCommands } from "./commands/navigator";

export const navigatorModule: ToolkitModule = {
  manifest: {
    id: "navigator",
    name: "Navigator",
    description:
      "Turns a prompt into a goal, decomposes it into sub-goals, summons cross-network huddles, and routes bot-to-bot work over DIDComm.",
    icon: "Compass",
    color: "#22d3ee",
    gradient: ["#22d3ee", "#6366f1"],
    category: "automation",
    status: "available",
    builtIn: true,
    tags: ["navigator", "goal", "planning", "huddle", "didcomm"],
    labels: { tier: "core", domain: "coordination" },
    version: "0.1.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2026-05-29T00:00:00Z",
    updatedAt: "2026-05-29T00:00:00Z",
    dependencies: [
      { id: "infrastructure", version: "^1.0.0", minimumVersion: "1.0.0", recommendedVersion: "1.0.0", latestVersion: "1.0.0" },
      { id: "jobs", version: "^1.0.0", minimumVersion: "1.0.0", recommendedVersion: "1.0.0", latestVersion: "1.0.0" },
    ],
  },
  commands: navigatorCommands,
  tools: [
    { id: "navigator.submitPrompt",    name: "Submit Prompt",    description: "Capture a prompt as a new Navigator Goal.",  commandId: "navigator_submit_prompt" },
    { id: "navigator.decomposeGoal",   name: "Decompose Goal",   description: "Break a goal into agent/huddle sub-goals.",   commandId: "navigator_decompose_goal" },
    { id: "navigator.summonHuddle",    name: "Summon Huddle",    description: "Form an ad-hoc cross-network huddle group.",  commandId: "navigator_summon_huddle" },
    { id: "navigator.startSubgoal",    name: "Start Sub-goal",   description: "Dispatch work for a single sub-goal.",         commandId: "navigator_start_subgoal" },
    { id: "navigator.controlSubgoal",  name: "Control Sub-goal", description: "Pause/resume/retry/reassign/complete a sub-goal.", commandId: "navigator_control_subgoal" },
    { id: "navigator.goalLifecycle",   name: "Goal Lifecycle",   description: "Inspect lifecycle timeline for a goal.",         commandId: "navigator_goal_lifecycle" },
    { id: "navigator.status",          name: "Navigator Status", description: "Inspect goals + huddles.",                     commandId: "navigator_status" },
    { id: "navigator.cancelGoal",      name: "Cancel Goal",      description: "Cancel a Navigator Goal.",                     commandId: "navigator_cancel_goal" },
  ],
};
