/**
 * NavigatorView — primary UI for the navigator toolkit.
 *
 * Renders the goal list, the active goal's sub-goal graph, and
 * summoned huddles. Inline editors let the operator author new
 * sub-goals and start work on individual sub-goals directly.
 */
import { useEffect, useMemo, useState } from "react";
import { Compass, Target, Users, Trash2, Plus, Play, X, Pause, CheckCircle, AlertTriangle, RotateCcw, SkipForward } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { navigatorService } from "../service";
import type { NavigatorSnapshot, NavigatorGoal, NavigatorHuddle, NavigatorSubgoal, NavigatorLifecycleEvent } from "../types";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import { useJobsContext } from "@/context/JobsContext";
import type { Job, Message } from "@/types";

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`navigator-pill navigator-pill--${status}`}>{status}</span>
  );
}

function getJobMessageIds(job: Job): string[] {
  const ids = new Set<string>();
  const steps = job.resultDetails?.steps || [];
  for (const step of steps) {
    if (step.commandId !== "send_message" && step.commandId !== "broadcast_message") continue;
    if (!step.result || typeof step.result !== "object") continue;
    const result = step.result as Record<string, unknown>;
    if (typeof result.messageId === "string" && result.messageId.trim()) {
      ids.add(result.messageId);
    }
    if (Array.isArray(result.messageIds)) {
      for (const messageId of result.messageIds) {
        if (typeof messageId === "string" && messageId.trim()) ids.add(messageId);
      }
    }
  }
  return Array.from(ids);
}

function getTrackedMessages(subgoal: NavigatorSubgoal, jobsById: Map<string, Job>, messagesById: Map<string, Message>): Message[] {
  const messageIds = new Set<string>();
  const jobs = subgoal.jobIds
    .map((id) => jobsById.get(id))
    .filter((j): j is Job => !!j);

  for (const job of jobs) {
    for (const messageId of getJobMessageIds(job)) {
      messageIds.add(messageId);
    }
  }

  return Array.from(messageIds)
    .map((id) => messagesById.get(id))
    .filter((m): m is Message => !!m)
    .sort((a, b) => (b.ts || 0) - (a.ts || a.id.localeCompare(b.id)));
}

function getSubgoalReplyInsight(
  subgoal: NavigatorSubgoal,
  jobsById: Map<string, Job>,
  messagesById: Map<string, Message>,
  agentNameById: Map<string, string>,
) {
  const messages = getTrackedMessages(subgoal, jobsById, messagesById);

  const pending = messages.filter((m) => m.status === "sending").length;
  const delivered = messages.filter((m) => m.status === "delivered").length;
  const failed = messages.filter((m) => m.status === "failed").length;
  const noPrompt = messages.filter((m) => m.status === "no-prompt").length;
  const latestDelivered = messages.find((m) => m.status === "delivered" && typeof m.response === "string" && m.response.trim().length > 0) || null;
  const awaitingAgents = Array.from(new Set(
    messages
      .filter((m) => m.status === "sending")
      .map((m) => agentNameById.get(m.toId) || m.toId.slice(0, 8)),
  ));

  return {
    tracked: messages.length,
    pending,
    delivered,
    failed,
    noPrompt,
    latestDelivered,
    awaitingAgents,
    messages,
  };
}

function formatDurationMs(ms: number | null): string {
  if (ms == null || ms < 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function getSubgoalExecutionInsight(subgoal: NavigatorSubgoal, jobsById: Map<string, Job>) {
  const jobs = subgoal.jobIds
    .map((id) => jobsById.get(id))
    .filter((j): j is Job => !!j)
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));

  const latest = jobs[0];
  const running = jobs.filter((j) => j.status === "running").length;
  const queued = jobs.filter((j) => j.status === "queued").length;
  const awaitingInput = jobs.filter((j) => j.status === "awaiting-input").length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  const totalSteps = latest?.steps?.length ?? 0;
  const completedSteps = latest?.steps?.filter((s) => s.status === "completed").length ?? 0;
  const activeStep = latest?.steps?.find((s) => s.status === "running")?.name
    || latest?.steps?.find((s) => s.status === "running")?.commandId
    || null;

  const durationMs = latest?.startedAt
    ? (latest.completedAt ? latest.completedAt - latest.startedAt : Date.now() - latest.startedAt)
    : null;

  return {
    latest,
    totalRuns: jobs.length,
    running,
    queued,
    awaitingInput,
    completed,
    failed,
    totalSteps,
    completedSteps,
    activeStep,
    durationMs,
  };
}

function summarizeDeliveredReplies(messages: Message[], agentNameById: Map<string, string>): string | null {
  const delivered = messages
    .filter((m) => m.status === "delivered" && typeof m.response === "string" && m.response.trim().length > 0)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));

  if (delivered.length === 0) return null;
  if (delivered.length === 1) return delivered[0].response?.trim() || null;

  return delivered
    .map((message) => {
      const agentName = agentNameById.get(message.toId) || message.toId.slice(0, 8);
      return `${agentName}: ${String(message.response).trim()}`;
    })
    .join("\n\n");
}

function getGoalExecutionSummary(goal: NavigatorGoal, jobsById: Map<string, Job>) {
  const total = goal.subgoals.length;
  const byStatus = {
    pending: 0,
    assigned: 0,
    consulting: 0,
    executing: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  let runningJobs = 0;
  let queuedJobs = 0;
  let awaitingInputJobs = 0;
  let failedJobs = 0;

  for (const sub of goal.subgoals) {
    if (sub.status in byStatus) {
      byStatus[sub.status as keyof typeof byStatus] += 1;
    }
    for (const jobId of sub.jobIds) {
      const job = jobsById.get(jobId);
      if (!job) continue;
      if (job.status === "running") runningJobs += 1;
      if (job.status === "queued") queuedJobs += 1;
      if (job.status === "awaiting-input") awaitingInputJobs += 1;
      if (job.status === "failed") failedJobs += 1;
    }
  }

  const done = byStatus.completed + byStatus.skipped;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return {
    total,
    done,
    progressPct,
    byStatus,
    runningJobs,
    queuedJobs,
    awaitingInputJobs,
    failedJobs,
  };
}

function HuddleCard({ huddle }: { huddle: NavigatorHuddle }) {
  return (
    <div className="navigator-huddle">
      <div className="navigator-huddle__head">
        <Users size={13} />
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
type SubgoalControlAction = "pause" | "resume" | "complete" | "fail" | "block" | "retry" | "skip";

const EXECUTING_SLA_MS = 5 * 60 * 1000;
const BLOCKED_SLA_MS = 2 * 60 * 1000;
const RETRY_ALERT_THRESHOLD = 2;

function isLifecycleErrorEvent(ev: NavigatorLifecycleEvent): boolean {
  const to = (ev.toStatus || "").toLowerCase();
  const msg = (ev.message || "").toLowerCase();
  return to === "failed" || to === "blocked" || msg.includes("error") || msg.includes("failed") || msg.includes("blocked");
}

function buildGoalAlerts(goal: NavigatorGoal): string[] {
  const now = Date.now();
  const alerts: string[] = [];

  const slowExecuting = goal.subgoals.filter((s) => s.status === "executing" && s.startedAt && now - s.startedAt > EXECUTING_SLA_MS);
  if (slowExecuting.length > 0) {
    alerts.push(`${slowExecuting.length} sub-goal(s) executing past SLA`);
  }

  const blockedLong = goal.subgoals.filter((s) => s.status === "blocked" && s.lastTransitionAt && now - s.lastTransitionAt > BLOCKED_SLA_MS);
  if (blockedLong.length > 0) {
    alerts.push(`${blockedLong.length} blocked sub-goal(s) past SLA`);
  }

  const highRetry = goal.subgoals.filter((s) => (s.retries || 0) >= RETRY_ALERT_THRESHOLD);
  if (highRetry.length > 0) {
    alerts.push(`${highRetry.length} sub-goal(s) have repeated retries`);
  }

  return alerts;
}

function SubgoalRow({ subgoal, agents, huddles, jobsById, messagesById, agentNameById, onStart, onControl }: {
  subgoal: NavigatorSubgoal;
  agents: AgentOption[];
  huddles: HuddleOption[];
  jobsById: Map<string, Job>;
  messagesById: Map<string, Message>;
  agentNameById: Map<string, string>;
  onStart: (sg: NavigatorSubgoal) => void;
  onControl: (sg: NavigatorSubgoal, action: SubgoalControlAction) => void;
}) {
  const assignedName = subgoal.assignedAgentId
    ? agents.find((a) => a.id === subgoal.assignedAgentId)?.name ?? subgoal.assignedAgentId.slice(0, 6)
    : null;
  const huddleLabel = subgoal.huddleId
    ? huddles.find((h) => h.id === subgoal.huddleId)?.label ?? "huddle"
    : null;
  const hasAssignee = !!subgoal.assignedAgentId || !!subgoal.huddleId;
  const canStart = hasAssignee && subgoal.status !== "executing" && subgoal.status !== "completed";
  const insight = getSubgoalExecutionInsight(subgoal, jobsById);
  const replyInsight = getSubgoalReplyInsight(subgoal, jobsById, messagesById, agentNameById);
  const latestResult = insight.latest?.resultDetails?.summary || insight.latest?.result || null;
  const latestJobStatus = insight.latest?.status;

  return (
    <li className="navigator-subgoal">
      <div className="navigator-subgoal__main">
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
      </div>
      <div className="navigator-subgoal__insights">
        <div className="navigator-subgoal__metrics">
          <span className="navigator-subgoal__metric">runs: {insight.totalRuns}</span>
          <span className="navigator-subgoal__metric">done: {insight.completed}</span>
          {insight.running > 0 ? <span className="navigator-subgoal__metric">running: {insight.running}</span> : null}
          {insight.queued > 0 ? <span className="navigator-subgoal__metric">queued: {insight.queued}</span> : null}
          {insight.awaitingInput > 0 ? <span className="navigator-subgoal__metric">awaiting input: {insight.awaitingInput}</span> : null}
          {insight.failed > 0 ? <span className="navigator-subgoal__metric navigator-subgoal__metric--error">failed: {insight.failed}</span> : null}
          {insight.totalSteps > 0 ? <span className="navigator-subgoal__metric">steps: {insight.completedSteps}/{insight.totalSteps}</span> : null}
          {insight.durationMs != null ? <span className="navigator-subgoal__metric">duration: {formatDurationMs(insight.durationMs)}</span> : null}
          {replyInsight.pending > 0 ? <span className="navigator-subgoal__metric navigator-subgoal__metric--pending">replies pending: {replyInsight.pending}</span> : null}
          {replyInsight.tracked > 0 ? <span className="navigator-subgoal__metric">replies: {replyInsight.delivered}/{replyInsight.tracked}</span> : null}
          {replyInsight.failed > 0 ? <span className="navigator-subgoal__metric navigator-subgoal__metric--error">reply failures: {replyInsight.failed}</span> : null}
        </div>
        {latestJobStatus ? (
          <div className="navigator-subgoal__latest">
            <span>latest job:</span>
            <StatusPill status={latestJobStatus} />
            <span className="navigator-subgoal__jobid">{insight.latest?.id.slice(0, 12)}</span>
            {insight.activeStep ? <span className="navigator-subgoal__active-step">active step: {insight.activeStep}</span> : null}
          </div>
        ) : null}
        {latestResult ? (
          <div className="navigator-subgoal__latest-result">{latestResult.length > 220 ? `${latestResult.slice(0, 220)}...` : latestResult}</div>
        ) : null}
        {replyInsight.latestDelivered ? (
          <div className="navigator-subgoal__reply">
            <div className="navigator-subgoal__reply-head">
              Latest reply from {agentNameById.get(replyInsight.latestDelivered.toId) || replyInsight.latestDelivered.toId.slice(0, 8)}
            </div>
            <div className="navigator-subgoal__reply-body">
              {String(replyInsight.latestDelivered.response).length > 260
                ? `${String(replyInsight.latestDelivered.response).slice(0, 260)}...`
                : String(replyInsight.latestDelivered.response)}
            </div>
          </div>
        ) : null}
        {replyInsight.pending > 0 ? (
          <div className="navigator-subgoal__awaiting">
            Awaiting {replyInsight.pending} repl{replyInsight.pending === 1 ? "y" : "ies"}
            {replyInsight.awaitingAgents.length > 0 ? `: ${replyInsight.awaitingAgents.join(", ")}` : ""}
          </div>
        ) : null}
        <div className="navigator-subgoal__controls">
          {subgoal.status === "executing" ? (
            <button type="button" className="navigator-subgoal__ctl" onClick={() => onControl(subgoal, "pause")}>
              <Pause size={10} /> Pause
            </button>
          ) : (
            <button type="button" className="navigator-subgoal__ctl" onClick={() => onControl(subgoal, "resume")}>
              <Play size={10} /> Resume
            </button>
          )}
          <button type="button" className="navigator-subgoal__ctl" onClick={() => onControl(subgoal, "complete")}>
            <CheckCircle size={10} /> Complete
          </button>
          <button type="button" className="navigator-subgoal__ctl" onClick={() => onControl(subgoal, "block")}>
            <AlertTriangle size={10} /> Block
          </button>
          <button type="button" className="navigator-subgoal__ctl" onClick={() => onControl(subgoal, "retry")}>
            <RotateCcw size={10} /> Retry
          </button>
          <button type="button" className="navigator-subgoal__ctl" onClick={() => onControl(subgoal, "skip")}>
            <SkipForward size={10} /> Skip
          </button>
        </div>
      </div>
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

function GoalCard({ goal, huddles, agents, jobsById, messagesById, agentNameById, isActive, onSelect, onCancel, onRemove, onStartSubgoal, onControlSubgoal }: {
  goal: NavigatorGoal;
  huddles: NavigatorHuddle[];
  agents: AgentOption[];
  jobsById: Map<string, Job>;
  messagesById: Map<string, Message>;
  agentNameById: Map<string, string>;
  isActive: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onStartSubgoal: (sg: NavigatorSubgoal) => void;
  onControlSubgoal: (sg: NavigatorSubgoal, action: SubgoalControlAction) => void;
}) {
  const [lifecycleErrorsOnly, setLifecycleErrorsOnly] = useState(false);
  const [lifecycleHuddlesOnly, setLifecycleHuddlesOnly] = useState(false);
  const [lifecycleSubgoalFilter, setLifecycleSubgoalFilter] = useState<string>("all");
  const huddleOptions: HuddleOption[] = huddles.map((h) => ({
    id: h.id,
    label: `huddle (${h.members.length})`,
  }));
  const summary = getGoalExecutionSummary(goal, jobsById);
  const alerts = buildGoalAlerts(goal);
  const lifecyclePreview = navigatorService.getGoalLifecycle(goal.id)
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter((ev) => {
      if (lifecycleErrorsOnly && !isLifecycleErrorEvent(ev)) return false;
      if (lifecycleHuddlesOnly && !ev.kind.startsWith("huddle-")) return false;
      if (lifecycleSubgoalFilter !== "all" && ev.subgoalId !== lifecycleSubgoalFilter) return false;
      return true;
    })
    .slice(0, 10);

  return (
    <div className={`navigator-goal ${isActive ? "navigator-goal--active" : ""}`} onClick={onSelect}>
      <div className="navigator-goal__head">
        <Target size={14} className="navigator-goal__head-icon" />
        <span className="navigator-goal__title">{goal.title}</span>
        <StatusPill status={goal.status} />
        <button
          className="navigator-goal__btn"
          title="Cancel goal"
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
          disabled={goal.status === "cancelled" || goal.status === "completed"}
        >
          <X size={12} />
        </button>
        <button
          className="navigator-goal__btn"
          title="Remove from list"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <p className="navigator-goal__prompt">{goal.prompt}</p>
      <div className="navigator-goal__meta">
        <span>{goal.subgoals.length} sub-goal(s)</span>
        <span>thid {goal.thid.slice(0, 8)}</span>
      </div>
      {summary.total > 0 ? (
        <div className="navigator-goal__summary" role="group" aria-label="Goal execution summary">
          <div className="navigator-goal__summary-head">
            <span>Progress {summary.done}/{summary.total}</span>
            <span>{summary.progressPct}%</span>
          </div>
          <div className="navigator-goal__summary-bar" aria-hidden="true">
            <div className="navigator-goal__summary-fill" style={{ width: `${summary.progressPct}%` }} />
          </div>
          <div className="navigator-goal__summary-metrics">
            <span className="navigator-goal__summary-chip">executing: {summary.byStatus.executing}</span>
            <span className="navigator-goal__summary-chip">consulting: {summary.byStatus.consulting}</span>
            <span className="navigator-goal__summary-chip">running jobs: {summary.runningJobs}</span>
            <span className="navigator-goal__summary-chip">queued jobs: {summary.queuedJobs}</span>
            {summary.awaitingInputJobs > 0 ? <span className="navigator-goal__summary-chip">awaiting input: {summary.awaitingInputJobs}</span> : null}
            {summary.failedJobs > 0 ? <span className="navigator-goal__summary-chip navigator-goal__summary-chip--error">failed jobs: {summary.failedJobs}</span> : null}
          </div>
        </div>
      ) : null}
      {alerts.length > 0 ? (
        <div className="navigator-goal__alerts">
          {alerts.map((alert, idx) => (
            <div key={`${goal.id}-alert-${idx}`} className="navigator-goal__alert">{alert}</div>
          ))}
        </div>
      ) : null}
      {goal.subgoals.length > 0 ? (
        <ul className="navigator-goal__subgoals">
          {goal.subgoals.map((s) => (
            <SubgoalRow
              key={s.id}
              subgoal={s}
              agents={agents}
              huddles={huddleOptions}
              jobsById={jobsById}
              messagesById={messagesById}
              agentNameById={agentNameById}
              onStart={onStartSubgoal}
              onControl={onControlSubgoal}
            />
          ))}
        </ul>
      ) : null}
      {lifecyclePreview.length > 0 ? (
        <div className="navigator-goal__lifecycle">
          <div className="navigator-goal__lifecycle-title">Lifecycle</div>
          <div className="navigator-goal__lifecycle-filters">
            <label className="navigator-goal__lifecycle-filter">
              <input
                type="checkbox"
                checked={lifecycleErrorsOnly}
                onChange={(e) => setLifecycleErrorsOnly(e.target.checked)}
              />
              errors only
            </label>
            <label className="navigator-goal__lifecycle-filter">
              <input
                type="checkbox"
                checked={lifecycleHuddlesOnly}
                onChange={(e) => setLifecycleHuddlesOnly(e.target.checked)}
              />
              huddles only
            </label>
            <select
              className="navigator-goal__lifecycle-select"
              value={lifecycleSubgoalFilter}
              onChange={(e) => setLifecycleSubgoalFilter(e.target.value)}
            >
              <option value="all">all subgoals</option>
              {goal.subgoals.map((s) => (
                <option key={s.id} value={s.id}>{s.title.slice(0, 48)}</option>
              ))}
            </select>
          </div>
          {lifecyclePreview.map((ev: NavigatorLifecycleEvent) => (
            <div key={ev.id} className="navigator-goal__lifecycle-item">
              <span className="navigator-goal__lifecycle-time">{new Date(ev.timestamp).toLocaleTimeString()}</span>
              <span className="navigator-goal__lifecycle-kind">{ev.kind}</span>
              {ev.subgoalId ? <span className="navigator-goal__lifecycle-subgoal">sub:{ev.subgoalId.slice(0, 8)}</span> : null}
              {ev.fromStatus || ev.toStatus ? (
                <span className="navigator-goal__lifecycle-status">{ev.fromStatus || "-"} → {ev.toStatus || "-"}</span>
              ) : null}
              {ev.message ? <span className="navigator-goal__lifecycle-msg">{ev.message}</span> : null}
            </div>
          ))}
        </div>
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
  const [stopLinkedJobsOnLifecycleControl, setStopLinkedJobsOnLifecycleControl] = useState(true);
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
  const jobsById = useMemo(() => {
    const map = new Map<string, Job>();
    for (const job of jobsCtx.jobs) map.set(job.id, job);
    return map;
  }, [jobsCtx.jobs]);
  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const message of workspaceCtx?.messages ?? []) {
      map.set(message.id, message);
    }
    return map;
  }, [workspaceCtx?.messages]);
  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of workspaceCtx?.agents ?? []) {
      map.set(agent.id, agent.name);
    }
    return map;
  }, [workspaceCtx?.agents]);

  const startSubgoal = (goalId: string) => (sub: NavigatorSubgoal) => {
    if (!jobsCtx) return;
    const instruction = sub.instruction || sub.title;
    if (sub.assignedAgentId) {
      const targetAgentId = sub.assignedAgentId;
      const job = jobsCtx.addJob({
        type: "send_message",
        request: {
          from_agent_id: "user",
          to_agent_id: targetAgentId,
          message: `[Navigator goal ${goalId} · sub-goal ${sub.id}] ${instruction}`,
        },
      });
      navigatorService.updateSubgoal(goalId, sub.id, {
        status: "executing",
        jobIds: [...sub.jobIds, job.id],
      });
    } else if (sub.huddleId) {
      const huddle = navigatorService.listHuddlesForGoal(goalId).find((h) => h.id === sub.huddleId);
      if (!huddle) {
        navigatorService.controlSubgoal(goalId, sub.id, {
          status: "blocked",
          reason: `Cannot start: huddle ${sub.huddleId} not found`,
          actor: "navigator",
          note: `Start requested but huddle ${sub.huddleId} is missing`,
        });
        return;
      }
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

  const controlSubgoal = (goalId: string) => (sub: NavigatorSubgoal, action: SubgoalControlAction) => {
    const stopActiveLinkedJobs = (): string[] => {
      if (!stopLinkedJobsOnLifecycleControl) return [];
      const stopped: string[] = [];
      for (const jobId of sub.jobIds) {
        const job = jobsCtx.jobs.find((j) => j.id === jobId);
        if (!job) continue;
        if (job.status !== "running" && job.status !== "awaiting-input") continue;
        jobsCtx.stopJob(jobId);
        stopped.push(jobId);
      }
      return stopped;
    };

    if (action === "pause") {
      const stopped = stopActiveLinkedJobs();
      navigatorService.controlSubgoal(goalId, sub.id, {
        status: "paused",
        reason: "Paused from Navigator UI",
        actor: "operator",
        note: stopped.length > 0 ? `Paused from UI; stopped ${stopped.length} linked job(s)` : "Paused from UI",
      });
      return;
    }
    if (action === "resume") {
      const status = sub.assignedAgentId || sub.huddleId ? "assigned" : "pending";
      navigatorService.controlSubgoal(goalId, sub.id, { status, reason: "Resumed from Navigator UI", actor: "operator", note: "Resumed from UI" });
      return;
    }
    if (action === "complete") {
      navigatorService.controlSubgoal(goalId, sub.id, { status: "completed", result: "Marked complete from Navigator UI", actor: "operator", note: "Marked complete from UI" });
      return;
    }
    if (action === "fail") {
      const stopped = stopActiveLinkedJobs();
      navigatorService.controlSubgoal(goalId, sub.id, {
        status: "failed",
        error: "Marked failed from Navigator UI",
        actor: "operator",
        note: stopped.length > 0 ? `Marked failed from UI; stopped ${stopped.length} linked job(s)` : "Marked failed from UI",
      });
      return;
    }
    if (action === "block") {
      const stopped = stopActiveLinkedJobs();
      navigatorService.controlSubgoal(goalId, sub.id, {
        status: "blocked",
        reason: "Blocked from Navigator UI",
        actor: "operator",
        note: stopped.length > 0 ? `Blocked from UI; stopped ${stopped.length} linked job(s)` : "Blocked from UI",
      });
      return;
    }
    if (action === "retry") {
      const status = sub.assignedAgentId || sub.huddleId ? "assigned" : "pending";
      navigatorService.controlSubgoal(goalId, sub.id, { status, incrementRetries: true, reason: "Retry requested from UI", actor: "operator", note: "Retry requested from UI" });
      return;
    }
    if (action === "skip") {
      const stopped = stopActiveLinkedJobs();
      navigatorService.controlSubgoal(goalId, sub.id, {
        status: "skipped",
        reason: "Skipped from Navigator UI",
        actor: "operator",
        note: stopped.length > 0 ? `Skipped from UI; stopped ${stopped.length} linked job(s)` : "Skipped from UI",
      });
    }
  };

  return (
    <div className="navigator-root">
      <div className="navigator-header">
        <div className="navigator-header-left">
          <h2 className="navigator-title">
            <GradientIcon icon={Compass} size={20} gradient={["#22d3ee", "#3b82f6"]} />
            Navigator
          </h2>
          <p className="navigator-subtitle">
            Plan goals, break them into sub-goals, and dispatch work to agents or huddles.
          </p>
        </div>
        <span className="navigator-stats">
          {snap.goals.length} goal(s) · {snap.huddles.length} huddle(s)
        </span>
      </div>
      <div className="navigator-controls">
        <label className="navigator-controls__toggle">
          <input
            type="checkbox"
            checked={stopLinkedJobsOnLifecycleControl}
            onChange={(e) => setStopLinkedJobsOnLifecycleControl(e.target.checked)}
          />
          stop running linked jobs when pause/block/fail/skip
        </label>
      </div>
      {snap.goals.length === 0 ? (
        <div className="navigator-empty">
          <Compass size={28} className="navigator-empty__icon" />
          <div className="navigator-empty__title">No goals yet</div>
          <p className="navigator-empty__desc">
            Open the chat panel and ask the Navigator to accomplish something. Sub-goals and huddles will appear here.
          </p>
        </div>
      ) : (
        <div className="navigator-list">
          {snap.goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              huddles={snap.huddles.filter((h) => h.goalId === g.id)}
              agents={agentOptions}
              jobsById={jobsById}
              messagesById={messagesById}
              agentNameById={agentNameById}
              isActive={snap.activeGoalId === g.id}
              onSelect={() => navigatorService.setActiveGoal(g.id)}
              onCancel={() => navigatorService.cancelGoal(g.id)}
              onRemove={() => navigatorService.removeGoal(g.id)}
              onStartSubgoal={startSubgoal(g.id)}
              onControlSubgoal={controlSubgoal(g.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
