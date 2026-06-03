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
  };
}

export interface BuildGoalArchiveArtifactInput {
  goal: NavigatorGoal;
  workspaceId?: string;
  name?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  tags?: string[];
}

export function buildGoalArchiveManifest(
  input: BuildGoalArchiveArtifactInput,
): NavigatorGoalArchiveManifest {
  const now = new Date().toISOString();
  const safeName = input.name
    || `goal-${input.goal.id.slice(0, 8)}-archive`;

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
    spec: { goal: input.goal },
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
