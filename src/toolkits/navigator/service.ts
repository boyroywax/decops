/**
 * Navigator service — persistent, observable store of goals + huddles.
 *
 * Mirrors `orchestratorService`: a small singleton with a subscribe()
 * API that React components and the bot can listen to. State persists to
 * localStorage so a page refresh doesn't lose in-flight goals.
 *
 * The service does NOT execute work itself. It:
 *   - records goals, sub-goals, and huddle sessions
 *   - mints DIDComm thread ids and routes envelopes through
 *     `@/services/didcomm`
 *   - delegates execution to the jobs subsystem (via callbacks injected
 *     by the navigator commands)
 */
import type {
  NavigatorGoal,
  NavigatorSubgoal,
  NavigatorHuddle,
  NavigatorSnapshot,
  NavigatorSubgoalStatus,
  NavigatorLifecycleEvent,
} from "./types";

const STORAGE_KEY = "decops.navigator.state.v1";

interface InternalState {
  goals: Record<string, NavigatorGoal>;
  huddles: Record<string, NavigatorHuddle>;
  activeGoalId: string | null;
}

function emptyState(): InternalState {
  return { goals: {}, huddles: {}, activeGoalId: null };
}

function load(): InternalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as InternalState;
    return {
      goals: parsed.goals ?? {},
      huddles: parsed.huddles ?? {},
      activeGoalId: parsed.activeGoalId ?? null,
    };
  } catch {
    return emptyState();
  }
}

function save(state: InternalState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { /* best effort */ }
}

function uuid(): string {
  return (globalThis.crypto && "randomUUID" in globalThis.crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

class NavigatorService {
  private state: InternalState = load();
  private subscribers = new Set<(snap: NavigatorSnapshot) => void>();

  // ── Subscribe / snapshot ────────────────────────────────────────

  snapshot(): NavigatorSnapshot {
    return {
      goals: Object.values(this.state.goals).sort((a, b) => b.createdAt - a.createdAt),
      huddles: Object.values(this.state.huddles).sort((a, b) => b.createdAt - a.createdAt),
      activeGoalId: this.state.activeGoalId,
    };
  }

  subscribe(fn: (snap: NavigatorSnapshot) => void): () => void {
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.subscribers) fn(snap);
    save(this.state);
  }

  private pushGoalEvent(goalId: string, event: Omit<NavigatorLifecycleEvent, "id" | "timestamp" | "goalId">): void {
    const goal = this.state.goals[goalId];
    if (!goal) return;
    const nextEvent: NavigatorLifecycleEvent = {
      id: uuid(),
      timestamp: Date.now(),
      goalId,
      ...event,
    };
    const lifecycle = [...(goal.lifecycle || []), nextEvent];
    this.state.goals[goalId] = { ...goal, lifecycle, updatedAt: Date.now() };
  }

  private pushSubgoalEvent(goalId: string, subgoalId: string, event: Omit<NavigatorLifecycleEvent, "id" | "timestamp" | "goalId" | "subgoalId">): void {
    const goal = this.state.goals[goalId];
    if (!goal) return;
    const idx = goal.subgoals.findIndex((s) => s.id === subgoalId);
    if (idx < 0) return;
    const current = goal.subgoals[idx];
    const nextEvent: NavigatorLifecycleEvent = {
      id: uuid(),
      timestamp: Date.now(),
      goalId,
      subgoalId,
      ...event,
    };
    const updatedSubgoal: NavigatorSubgoal = {
      ...current,
      lifecycle: [...(current.lifecycle || []), nextEvent],
      updatedAt: Date.now(),
      lastTransitionAt: Date.now(),
    };
    const subgoals = [...goal.subgoals];
    subgoals[idx] = updatedSubgoal;
    this.state.goals[goalId] = { ...goal, subgoals, updatedAt: Date.now(), lastTransitionAt: Date.now() };
  }

  // ── Goals ───────────────────────────────────────────────────────

  createGoal(input: { prompt: string; title?: string; networkIds?: string[] }): NavigatorGoal {
    const now = Date.now();
    const id = uuid();
    const goal: NavigatorGoal = {
      id,
      prompt: input.prompt,
      title: input.title ?? input.prompt.slice(0, 80),
      status: "draft",
      subgoals: [],
      thid: uuid(),
      networkIds: input.networkIds ?? [],
      createdAt: now,
      updatedAt: now,
      lastTransitionAt: now,
      lifecycle: [],
    };
    this.state.goals[id] = goal;
    this.pushGoalEvent(id, {
      kind: "goal-created",
      toStatus: "draft",
      message: `Goal created: ${goal.title}`,
      actor: "navigator",
    });
    this.state.activeGoalId = id;
    this.emit();
    return goal;
  }

  getGoal(id: string): NavigatorGoal | undefined {
    return this.state.goals[id];
  }

  setActiveGoal(id: string | null): void {
    if (id !== null && !this.state.goals[id]) {
      throw new Error(`Unknown goal: ${id}`);
    }
    this.state.activeGoalId = id;
    this.emit();
  }

  updateGoal(id: string, patch: Partial<NavigatorGoal>): NavigatorGoal {
    const goal = this.state.goals[id];
    if (!goal) throw new Error(`Unknown goal: ${id}`);
    const now = Date.now();
    const previousStatus = goal.status;
    const next: NavigatorGoal = { ...goal, ...patch, id: goal.id, updatedAt: now, lastTransitionAt: now };
    if (patch.status && patch.status !== previousStatus) {
      if (patch.status === "executing" && !next.startedAt) next.startedAt = now;
      if ((patch.status === "completed" || patch.status === "failed" || patch.status === "cancelled") && !next.completedAt) {
        next.completedAt = now;
      }
    }
    this.state.goals[id] = next;
    if (patch.status && patch.status !== previousStatus) {
      this.pushGoalEvent(id, {
        kind: patch.status === "cancelled" ? "goal-cancelled" : "goal-status",
        actor: "navigator",
        fromStatus: previousStatus,
        toStatus: patch.status,
        message: patch.error || patch.synthesis,
      });
    }
    this.emit();
    return next;
  }

  cancelGoal(id: string): NavigatorGoal {
    return this.updateGoal(id, { status: "cancelled" });
  }

  removeGoal(id: string): void {
    this.pushGoalEvent(id, {
      kind: "goal-removed",
      actor: "navigator",
      message: "Goal removed from active list",
    });
    delete this.state.goals[id];
    for (const h of Object.values(this.state.huddles)) {
      if (h.goalId === id) delete this.state.huddles[h.id];
    }
    if (this.state.activeGoalId === id) this.state.activeGoalId = null;
    this.emit();
  }

  // ── Subgoals ────────────────────────────────────────────────────

  addSubgoals(
    goalId: string,
    specs: Array<Pick<NavigatorSubgoal, "title" | "instruction"> &
      Partial<Pick<NavigatorSubgoal, "assignedAgentId" | "huddleId" | "order">>>,
  ): NavigatorSubgoal[] {
    const goal = this.state.goals[goalId];
    if (!goal) throw new Error(`Unknown goal: ${goalId}`);
    const now = Date.now();
    const created: NavigatorSubgoal[] = specs.map((s, idx) => ({
      id: uuid(),
      goalId,
      title: s.title,
      instruction: s.instruction,
      assignedAgentId: s.assignedAgentId,
      huddleId: s.huddleId,
      status: s.assignedAgentId || s.huddleId ? "assigned" : "pending",
      jobIds: [],
      retries: 0,
      order: s.order ?? idx,
      createdAt: now,
      updatedAt: now,
      lastTransitionAt: now,
      lifecycle: [],
    }));
    const next: NavigatorGoal = {
      ...goal,
      subgoals: [...goal.subgoals, ...created],
      status: goal.status === "draft" ? "planning" : goal.status,
      updatedAt: now,
    };
    this.state.goals[goalId] = next;
    for (const subgoal of created) {
      this.pushSubgoalEvent(goalId, subgoal.id, {
        kind: "subgoal-created",
        actor: "navigator",
        toStatus: subgoal.status,
        message: subgoal.title,
      });
    }
    this.emit();
    return created;
  }

  updateSubgoal(goalId: string, subgoalId: string, patch: Partial<NavigatorSubgoal>): NavigatorSubgoal {
    const goal = this.state.goals[goalId];
    if (!goal) throw new Error(`Unknown goal: ${goalId}`);
    const idx = goal.subgoals.findIndex((s) => s.id === subgoalId);
    if (idx < 0) throw new Error(`Unknown subgoal: ${subgoalId}`);
    const now = Date.now();
    const previous = goal.subgoals[idx];
    const updated: NavigatorSubgoal = {
      ...previous,
      ...patch,
      id: subgoalId,
      goalId,
      updatedAt: now,
      lastTransitionAt: now,
    };
    if (patch.status && patch.status !== previous.status) {
      if (patch.status === "executing" && !updated.startedAt) updated.startedAt = now;
      if (patch.status === "completed" || patch.status === "failed" || patch.status === "skipped") {
        updated.completedAt = now;
      }
    }
    if (patch.jobIds && patch.jobIds.length > 0) {
      updated.latestJobId = patch.jobIds[patch.jobIds.length - 1];
    }
    const subgoals = [...goal.subgoals];
    subgoals[idx] = updated;
    this.state.goals[goalId] = { ...goal, subgoals, updatedAt: Date.now() };
    if (patch.status && patch.status !== previous.status) {
      this.pushSubgoalEvent(goalId, subgoalId, {
        kind: "subgoal-status",
        actor: "navigator",
        fromStatus: previous.status,
        toStatus: patch.status,
        message: patch.reason || patch.result || patch.error,
        jobId: updated.latestJobId,
      });
    }
    if (patch.jobIds && patch.jobIds.length > 0) {
      this.pushSubgoalEvent(goalId, subgoalId, {
        kind: "subgoal-job-linked",
        actor: "navigator",
        message: "Linked execution job",
        jobId: patch.jobIds[patch.jobIds.length - 1],
      });
    }
    this.recomputeGoalStatus(goalId);
    return updated;
  }

  controlSubgoal(
    goalId: string,
    subgoalId: string,
    input: {
      status?: NavigatorSubgoalStatus;
      reason?: string;
      result?: string;
      error?: string;
      assignedAgentId?: string;
      huddleId?: string;
      appendJobId?: string;
      actor?: string;
      note?: string;
      incrementRetries?: boolean;
    },
  ): NavigatorSubgoal {
    const goal = this.state.goals[goalId];
    if (!goal) throw new Error(`Unknown goal: ${goalId}`);
    const sub = goal.subgoals.find((s) => s.id === subgoalId);
    if (!sub) throw new Error(`Unknown subgoal: ${subgoalId}`);

    const nextJobIds = input.appendJobId ? [...sub.jobIds, input.appendJobId] : sub.jobIds;
    const nextRetries = input.incrementRetries ? (sub.retries || 0) + 1 : sub.retries;

    const updated = this.updateSubgoal(goalId, subgoalId, {
      status: input.status ?? sub.status,
      reason: input.reason ?? sub.reason,
      result: input.result ?? sub.result,
      error: input.error ?? sub.error,
      assignedAgentId: input.assignedAgentId !== undefined ? input.assignedAgentId : sub.assignedAgentId,
      huddleId: input.huddleId !== undefined ? input.huddleId : sub.huddleId,
      jobIds: nextJobIds,
      retries: nextRetries,
    });

    if (input.note) {
      this.pushSubgoalEvent(goalId, subgoalId, {
        kind: "subgoal-note",
        actor: input.actor || "operator",
        message: input.note,
        jobId: input.appendJobId,
      });
      this.emit();
    }

    return updated;
  }

  getGoalLifecycle(goalId: string): NavigatorLifecycleEvent[] {
    const goal = this.state.goals[goalId];
    if (!goal) return [];
    const goalEvents = goal.lifecycle || [];
    const subgoalEvents = goal.subgoals.flatMap((s) => s.lifecycle || []);
    return [...goalEvents, ...subgoalEvents].sort((a, b) => a.timestamp - b.timestamp);
  }

  private recomputeGoalStatus(goalId: string): void {
    const goal = this.state.goals[goalId];
    if (!goal) return;
    if (goal.status === "cancelled" || goal.status === "failed") { this.emit(); return; }
    const subs = goal.subgoals;
    if (subs.length === 0) { this.emit(); return; }
    const prev = goal.status;
    if (subs.some((s) => s.status === "failed")) {
      this.state.goals[goalId] = { ...goal, status: "failed", updatedAt: Date.now() };
    } else if (subs.some((s) => s.status === "blocked" || s.status === "paused")) {
      this.state.goals[goalId] = { ...goal, status: "blocked", updatedAt: Date.now() };
    } else if (subs.every((s) => s.status === "completed" || s.status === "skipped")) {
      this.state.goals[goalId] = { ...goal, status: "completed", updatedAt: Date.now() };
    } else if (subs.some((s) => s.status === "executing" || s.status === "consulting")) {
      this.state.goals[goalId] = { ...goal, status: "executing", updatedAt: Date.now() };
    }
    const next = this.state.goals[goalId]?.status;
    if (next && next !== prev) {
      this.pushGoalEvent(goalId, {
        kind: "goal-status",
        actor: "navigator",
        fromStatus: prev,
        toStatus: next,
      });
    }
    this.emit();
  }

  // ── Huddles ─────────────────────────────────────────────────────

  registerHuddle(input: {
    goalId: string;
    subgoalId: string;
    groupId: string;
    members: string[];
    networkIds: string[];
  }): NavigatorHuddle {
    const goal = this.state.goals[input.goalId];
    if (!goal) throw new Error(`Unknown goal: ${input.goalId}`);
    const now = Date.now();
    const huddle: NavigatorHuddle = {
      id: uuid(),
      goalId: input.goalId,
      subgoalId: input.subgoalId,
      groupId: input.groupId,
      members: input.members,
      networkIds: input.networkIds,
      pthid: goal.thid,
      thid: uuid(),
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    this.state.huddles[huddle.id] = huddle;
    this.pushGoalEvent(input.goalId, {
      kind: "huddle-created",
      actor: "navigator",
      subgoalId: input.subgoalId,
      message: `Huddle ${huddle.id} registered`,
    });
    this.updateSubgoal(input.goalId, input.subgoalId, { huddleId: huddle.id, status: "consulting" });
    return huddle;
  }

  updateHuddle(id: string, patch: Partial<NavigatorHuddle>): NavigatorHuddle {
    const h = this.state.huddles[id];
    if (!h) throw new Error(`Unknown huddle: ${id}`);
    const next: NavigatorHuddle = { ...h, ...patch, id, updatedAt: Date.now() };
    this.state.huddles[id] = next;
    this.pushGoalEvent(next.goalId, {
      kind: "huddle-status",
      actor: "navigator",
      subgoalId: next.subgoalId,
      fromStatus: h.status,
      toStatus: next.status,
    });
    this.emit();
    return next;
  }

  listHuddlesForGoal(goalId: string): NavigatorHuddle[] {
    return Object.values(this.state.huddles).filter((h) => h.goalId === goalId);
  }

  // ── Maintenance ─────────────────────────────────────────────────

  reset(): void {
    this.state = emptyState();
    this.emit();
  }
}

/** Singleton instance — import this anywhere the navigator state is needed. */
export const navigatorService = new NavigatorService();
