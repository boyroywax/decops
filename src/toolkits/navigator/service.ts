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
    };
    this.state.goals[id] = goal;
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
    const next: NavigatorGoal = { ...goal, ...patch, id: goal.id, updatedAt: Date.now() };
    this.state.goals[id] = next;
    this.emit();
    return next;
  }

  cancelGoal(id: string): NavigatorGoal {
    return this.updateGoal(id, { status: "cancelled" });
  }

  removeGoal(id: string): void {
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
      order: s.order ?? idx,
      createdAt: now,
      updatedAt: now,
    }));
    const next: NavigatorGoal = {
      ...goal,
      subgoals: [...goal.subgoals, ...created],
      status: goal.status === "draft" ? "planning" : goal.status,
      updatedAt: now,
    };
    this.state.goals[goalId] = next;
    this.emit();
    return created;
  }

  updateSubgoal(goalId: string, subgoalId: string, patch: Partial<NavigatorSubgoal>): NavigatorSubgoal {
    const goal = this.state.goals[goalId];
    if (!goal) throw new Error(`Unknown goal: ${goalId}`);
    const idx = goal.subgoals.findIndex((s) => s.id === subgoalId);
    if (idx < 0) throw new Error(`Unknown subgoal: ${subgoalId}`);
    const updated: NavigatorSubgoal = { ...goal.subgoals[idx], ...patch, id: subgoalId, goalId, updatedAt: Date.now() };
    const subgoals = [...goal.subgoals];
    subgoals[idx] = updated;
    this.state.goals[goalId] = { ...goal, subgoals, updatedAt: Date.now() };
    this.recomputeGoalStatus(goalId);
    return updated;
  }

  private recomputeGoalStatus(goalId: string): void {
    const goal = this.state.goals[goalId];
    if (!goal) return;
    if (goal.status === "cancelled" || goal.status === "failed") { this.emit(); return; }
    const subs = goal.subgoals;
    if (subs.length === 0) { this.emit(); return; }
    if (subs.some((s) => s.status === "failed")) {
      this.state.goals[goalId] = { ...goal, status: "failed", updatedAt: Date.now() };
    } else if (subs.every((s) => s.status === "completed" || s.status === "skipped")) {
      this.state.goals[goalId] = { ...goal, status: "completed", updatedAt: Date.now() };
    } else if (subs.some((s) => s.status === "executing" || s.status === "consulting")) {
      this.state.goals[goalId] = { ...goal, status: "executing", updatedAt: Date.now() };
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
    this.updateSubgoal(input.goalId, input.subgoalId, { huddleId: huddle.id, status: "consulting" });
    return huddle;
  }

  updateHuddle(id: string, patch: Partial<NavigatorHuddle>): NavigatorHuddle {
    const h = this.state.huddles[id];
    if (!h) throw new Error(`Unknown huddle: ${id}`);
    const next: NavigatorHuddle = { ...h, ...patch, id, updatedAt: Date.now() };
    this.state.huddles[id] = next;
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
