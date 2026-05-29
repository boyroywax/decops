/**
 * NavigatorView — primary UI for the navigator toolkit.
 *
 * Renders the goal list, the active goal's sub-goal graph, and
 * summoned huddles. Inline editors let the operator author new
 * sub-goals and start work on individual sub-goals directly.
 */
import { useEffect, useMemo, useState } from "react";
import { Compass, Target, Users, Trash2, Plus, Play } from "lucide-react";
import { navigatorService } from "../service";
import type { NavigatorSnapshot, NavigatorGoal, NavigatorHuddle, NavigatorSubgoal } from "../types";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import { useJobsContext } from "@/context/JobsContext";

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`navigator-pill navigator-pill--${status}`}>{status}</span>
  );
}

function HuddleCard({ huddle }: { huddle: NavigatorHuddle }) {
  return (
    <div className="navigator-huddle">
      <div className="navigator-huddle__head">
        <Users size={12} />
        <span className="navigator-huddle__title">Huddle</span>
        <StatusPill status={huddle.status} />
      </div>
      <div className="navigator-huddle__meta">
        {huddle.members.length} member(s) across {huddle.networkIds.length} network(s)
      </div>
      {huddle.decision ? <div className="navigator-huddle__decision">{huddle.decision}</div> : null}
    </div>
  );
}

interface AgentOption { id: string; name: string }
interface HuddleOption { id: string; label: string }

function SubgoalRow({ subgoal, agents, huddles, onStart }: {
  subgoal: NavigatorSubgoal;
  agents: AgentOption[];
  huddles: HuddleOption[];
  onStart: (sg: NavigatorSubgoal) => void;
}) {
  const assignedName = subgoal.assignedAgentId
    ? agents.find((a) => a.id === subgoal.assignedAgentId)?.name ?? subgoal.assignedAgentId.slice(0, 6)
    : null;
  const huddleLabel = subgoal.huddleId
    ? huddles.find((h) => h.id === subgoal.huddleId)?.label ?? "huddle"
    : null;
  const hasAssignee = !!subgoal.assignedAgentId || !!subgoal.huddleId;
  const canStart = hasAssignee && subgoal.status !== "executing" && subgoal.status !== "completed";

  return (
    <li className="navigator-subgoal">
      <StatusPill status={subgoal.status} />
      <span className="navigator-subgoal__title">{subgoal.title}</span>
      {assignedName ? <span className="navigator-subgoal__assignee">→ {assignedName}</span> : null}
      {huddleLabel ? <span className="navigator-subgoal__assignee">⇒ {huddleLabel}</span> : null}
      <button
        type="button"
        className="navigator-subgoal__start"
        disabled={!canStart}
        title={canStart ? "Start this sub-goal" : "Assign an agent or huddle first"}
        onClick={(e) => { e.stopPropagation(); onStart(subgoal); }}
      >
        <Play size={10} /> Start
      </button>
    </li>
  );
}

function AddSubgoalForm({ goalId, agents, huddles, onAdded }: {
  goalId: string;
  agents: AgentOption[];
  huddles: HuddleOption[];
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [assignedAgentId, setAssignedAgentId] = useState<string>("");
  const [huddleId, setHuddleId] = useState<string>("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!title.trim()) return;
    navigatorService.addSubgoals(goalId, [{
      title: title.trim(),
      instruction: instruction.trim(),
      assignedAgentId: assignedAgentId || undefined,
      huddleId: huddleId || undefined,
    }]);
    setTitle("");
    setInstruction("");
    setAssignedAgentId("");
    setHuddleId("");
    onAdded();
  };

  return (
    <form className="navigator-subgoal-form" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
      <input
        className="navigator-subgoal-form__input"
        placeholder="Sub-goal title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="navigator-subgoal-form__input"
        placeholder="Instruction (sent to assignee)"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <div className="navigator-subgoal-form__row">
        <select
          className="navigator-subgoal-form__select"
          value={assignedAgentId}
          onChange={(e) => { setAssignedAgentId(e.target.value); if (e.target.value) setHuddleId(""); }}
        >
          <option value="">Assign agent…</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select
          className="navigator-subgoal-form__select"
          value={huddleId}
          onChange={(e) => { setHuddleId(e.target.value); if (e.target.value) setAssignedAgentId(""); }}
        >
          <option value="">…or huddle</option>
          {huddles.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>
        <button type="submit" className="navigator-subgoal-form__add" disabled={!title.trim()}>
          <Plus size={11} /> Add
        </button>
      </div>
    </form>
  );
}

function GoalCard({ goal, huddles, agents, isActive, onSelect, onCancel, onRemove, onStartSubgoal }: {
  goal: NavigatorGoal;
  huddles: NavigatorHuddle[];
  agents: AgentOption[];
  isActive: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onStartSubgoal: (sg: NavigatorSubgoal) => void;
}) {
  const huddleOptions: HuddleOption[] = huddles.map((h) => ({
    id: h.id,
    label: `huddle (${h.members.length})`,
  }));
  return (
    <div className={`navigator-goal ${isActive ? "navigator-goal--active" : ""}`} onClick={onSelect}>
      <div className="navigator-goal__head">
        <Target size={12} />
        <span className="navigator-goal__title">{goal.title}</span>
        <StatusPill status={goal.status} />
        <button
          className="navigator-goal__btn"
          title="Cancel goal"
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
          disabled={goal.status === "cancelled" || goal.status === "completed"}
        >
          ✕
        </button>
        <button
          className="navigator-goal__btn"
          title="Remove from list"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <Trash2 size={11} />
        </button>
      </div>
      <div className="navigator-goal__prompt">{goal.prompt}</div>
      <div className="navigator-goal__meta">
        {goal.subgoals.length} sub-goal(s) · thid {goal.thid.slice(0, 8)}
      </div>
      {goal.subgoals.length > 0 ? (
        <ul className="navigator-goal__subgoals">
          {goal.subgoals.map((s) => (
            <SubgoalRow key={s.id} subgoal={s} agents={agents} huddles={huddleOptions} onStart={onStartSubgoal} />
          ))}
        </ul>
      ) : null}
      {goal.status !== "completed" && goal.status !== "cancelled" ? (
        <AddSubgoalForm
          goalId={goal.id}
          agents={agents}
          huddles={huddleOptions}
          onAdded={() => { /* state refreshes via subscribe */ }}
        />
      ) : null}
      {huddles.length > 0 ? (
        <div className="navigator-goal__huddles">
          {huddles.map((h) => <HuddleCard key={h.id} huddle={h} />)}
        </div>
      ) : null}
    </div>
  );
}

export function NavigatorView() {
  const [snap, setSnap] = useState<NavigatorSnapshot>(() => navigatorService.snapshot());
  const workspaceCtx = useWorkspaceContext();
  const jobsCtx = useJobsContext();

  useEffect(() => {
    const unsub = navigatorService.subscribe(setSnap);
    return () => { unsub(); };
  }, []);

  const agentOptions: AgentOption[] = useMemo(
    () => (workspaceCtx?.agents ?? []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })),
    [workspaceCtx?.agents],
  );

  const startSubgoal = (goalId: string) => (sub: NavigatorSubgoal) => {
    if (!jobsCtx) return;
    const agents = workspaceCtx?.agents ?? [];
    const instruction = sub.instruction || sub.title;
    if (sub.assignedAgentId) {
      const target = agents.find((a: { id: string }) => a.id === sub.assignedAgentId);
      if (!target) return;
      const job = jobsCtx.addJob({
        type: "send_message",
        request: {
          from_agent_id: "user",
          to_agent_id: target.id,
          message: `[Navigator goal ${goalId} · sub-goal ${sub.id}] ${instruction}`,
        },
      });
      navigatorService.updateSubgoal(goalId, sub.id, {
        status: "executing",
        jobIds: [...sub.jobIds, job.id],
      });
    } else if (sub.huddleId) {
      const huddle = navigatorService.listHuddlesForGoal(goalId).find((h) => h.id === sub.huddleId);
      if (!huddle) return;
      const groupId = huddle.groupId.startsWith("job:") ? huddle.groupId.slice(4) : huddle.groupId;
      const job = jobsCtx.addJob({
        type: "broadcast_message",
        request: {
          group_id: groupId,
          message: `[Navigator goal ${goalId} · sub-goal ${sub.id} · huddle ${huddle.id}] ${instruction}`,
        },
      });
      navigatorService.updateSubgoal(goalId, sub.id, {
        status: "executing",
        jobIds: [...sub.jobIds, job.id],
      });
    }
  };

  return (
    <div className="navigator-view">
      <header className="navigator-view__header">
        <Compass size={16} />
        <h2>Navigator</h2>
        <span className="navigator-view__sub">
          {snap.goals.length} goal(s) · {snap.huddles.length} huddle(s)
        </span>
      </header>
      {snap.goals.length === 0 ? (
        <div className="navigator-view__empty">
          <p>No goals yet. Open the chat panel and ask the Navigator to accomplish something.</p>
        </div>
      ) : (
        <div className="navigator-view__list">
          {snap.goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              huddles={snap.huddles.filter((h) => h.goalId === g.id)}
              agents={agentOptions}
              isActive={snap.activeGoalId === g.id}
              onSelect={() => navigatorService.setActiveGoal(g.id)}
              onCancel={() => navigatorService.cancelGoal(g.id)}
              onRemove={() => navigatorService.removeGoal(g.id)}
              onStartSubgoal={startSubgoal(g.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
