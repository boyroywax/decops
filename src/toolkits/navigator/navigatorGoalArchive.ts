/**
 * Navigator Goal Archive — Kubernetes-style manifest for archiving goals.
 *
 * Follows the same v0 manifest envelope used by the collective-memory
 * archive system:  { kind, schema, metadata, spec }
 *
 * Usage:
 *   const { manifest, artifact } = buildGoalArchiveArtifact({ goal, workspaceId });
 *   jobsCtx.importArtifact(artifact);
 */
import type { NavigatorGoal } from "./types";
import type { JobArtifact } from "@/types";

export const GOAL_ARCHIVE_KIND = "v0" as const;
export const GOAL_ARCHIVE_SCHEMA = "navigator-goal" as const;

export interface NavigatorGoalArchiveMetadata {
  name: string;
  workspace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  identity?: Record<string, unknown>;
  timestamps: {
    createdAt: string;
    completedAt?: string;
    exportedAt: string;
  };
}

export interface NavigatorGoalArchiveManifest {
  kind: typeof GOAL_ARCHIVE_KIND;
  schema: typeof GOAL_ARCHIVE_SCHEMA;
  metadata: NavigatorGoalArchiveMetadata;
  spec: {
    goal: NavigatorGoal;
    processOrder: NavigatorGoalProcessOrder;
  };
}

export interface NavigatorGoalProcessOrderGroup {
  step: number;
  execution: "sequential" | "parallel";
  order: number;
  subgoals: Array<{
    id: string;
    title: string;
    status: string;
    order: number;
  }>;
}

export interface NavigatorGoalProcessOrder {
  strategy: "sequential" | "parallel" | "mixed";
  summary: string;
  groups: NavigatorGoalProcessOrderGroup[];
}

export interface BuildGoalArchiveArtifactInput {
  goal: NavigatorGoal;
  workspaceId?: string;
  name?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  tags?: string[];
}

export function buildGoalProcessOrder(goal: NavigatorGoal): NavigatorGoalProcessOrder {
  const indexed = goal.subgoals.map((subgoal, index) => ({
    subgoal,
    index,
    order: Number.isFinite(subgoal.order) ? Number(subgoal.order) : index + 1,
  }));

  const sorted = [...indexed].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.index - b.index;
  });

  const orderKeys = Array.from(new Set(sorted.map((item) => item.order))).sort((a, b) => a - b);

  const groups: NavigatorGoalProcessOrderGroup[] = orderKeys.map((order, idx) => {
    const members = sorted.filter((item) => item.order === order);
    return {
      step: idx + 1,
      execution: members.length > 1 ? "parallel" : "sequential",
      order,
      subgoals: members.map(({ subgoal }) => ({
        id: subgoal.id,
        title: subgoal.title,
        status: subgoal.status,
        order,
      })),
    };
  });

  const parallelGroups = groups.filter((g) => g.execution === "parallel").length;
  const strategy: NavigatorGoalProcessOrder["strategy"] =
    groups.length <= 1
      ? (parallelGroups > 0 ? "parallel" : "sequential")
      : (parallelGroups > 0 ? "mixed" : "sequential");

  const summary = groups.length === 0
    ? "No subgoals defined."
    : groups.map((group) => {
      if (group.execution === "parallel") {
        return `Step ${group.step}: run ${group.subgoals.length} subgoals in parallel (${group.subgoals.map((s) => s.title).join("; ")})`;
      }
      return `Step ${group.step}: run ${group.subgoals[0].title} sequentially`;
    }).join(". ");

  return {
    strategy,
    summary,
    groups,
  };
}

export function buildGoalArchiveManifest(
  input: BuildGoalArchiveArtifactInput,
): NavigatorGoalArchiveManifest {
  const now = new Date().toISOString();
  const safeName = input.name
    || `goal-${input.goal.id.slice(0, 8)}-archive`;
  const processOrder = buildGoalProcessOrder(input.goal);

  return {
    kind: GOAL_ARCHIVE_KIND,
    schema: GOAL_ARCHIVE_SCHEMA,
    metadata: {
      name: safeName,
      workspace: input.workspaceId,
      labels: {
        status: input.goal.status,
        ...(input.labels ?? {}),
      },
      annotations: {
        goalId: input.goal.id,
        subgoalCount: String(input.goal.subgoals.length),
        processStrategy: processOrder.strategy,
        processSteps: String(processOrder.groups.length),
        parallelSteps: String(processOrder.groups.filter((g) => g.execution === "parallel").length),
        ...(input.annotations ?? {}),
      },
      timestamps: {
        createdAt: new Date(input.goal.createdAt).toISOString(),
        ...(input.goal.completedAt
          ? { completedAt: new Date(input.goal.completedAt).toISOString() }
          : {}),
        exportedAt: now,
      },
    },
    spec: {
      goal: input.goal,
      processOrder,
    },
  };
}

export function buildGoalArchiveArtifact(
  input: BuildGoalArchiveArtifactInput,
): { manifest: NavigatorGoalArchiveManifest; artifact: JobArtifact } {
  const manifest = buildGoalArchiveManifest(input);
  const artifactName = `${manifest.metadata.name}.json`;

  const artifact: JobArtifact = {
    id: crypto.randomUUID(),
    name: artifactName,
    type: "json",
    content: JSON.stringify(manifest, null, 2),
    tags: Array.from(
      new Set([
        "type:json",
        "navigator:goal-archive",
        `goal:id:${input.goal.id.slice(0, 8)}`,
        `goal:status:${input.goal.status}`,
        ...(input.tags ?? []),
      ]),
    ),
    createdAt: Date.now(),
    description: `Navigator goal archive — ${input.goal.title}`,
    source: "command",
  };

  return { manifest, artifact };
}
