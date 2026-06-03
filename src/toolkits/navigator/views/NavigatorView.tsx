/**
 * NavigatorView — structured UI for goals, sub-goals, and huddles.
 *
 * Goals are shown as collapsible cards with progress bars, status
 * badges, and an archive button (saves a Kubernetes-style manifest
 * artifact). Sub-goals display in a numbered list with grouped
 * controls and inline execution insights.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Compass, Target, Users, Trash2, Plus, Play, X, Pause, CheckCircle,
  AlertTriangle, RotateCcw, SkipForward, ChevronDown, ChevronRight,
  Archive, Package, CheckCheck,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { navigatorService } from "../service";
import type {
  NavigatorSnapshot, NavigatorGoal, NavigatorHuddle,
  NavigatorSubgoal, NavigatorLifecycleEvent,
} from "../types";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import { useJobsContext } from "@/context/JobsContext";
import type { Job, Message } from "@/types";
import { buildGoalArchiveArtifact } from "../navigatorGoalArchive";

// ─────────────────────────────────────────────────────────────────────────────
//  Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  return <span className={`nav2-pill nav2-pill--${status}`}>{status}</span>;
}

function formatDurationMs(ms: number | null): string {
  if (ms == null || ms < 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function getJobMessageIds(job: Job): string[] {
  const ids = new Set<string>();
  for (const step of job.resultDetails?.steps || []) {
    if (step.commandId !== "send_message" && step.commandId !== "broadcast_message") continue;
    if (!step.result || typeof step.result !== "object") continue;
    const r = step.result as Record<string, unknown>;
    if (typeof r.messageId === "string" && r.messageId.trim()) ids.add(r.messageId);
    if (Array.isArray(r.messageIds)) {
      for (const id of r.messageIds) { if (typeof id === "string" && id.trim()) ids.add(id); }
    }
  }
  return Array.from(ids);
}

function getTrackedMessages(
  subgoal: NavigatorSubgoal,
  jobsById: Map<string, Job>,
  messagesById: Map<string, Message>,
): Message[] {
  const ids = new Set<string>();
  for (const jobId of subgoal.jobIds) {
    const job = jobsById.get(jobId);
    if (job) for (const id of getJobMessageIds(job)) ids.add(id);
  }
  return Array.from(ids)
    .map((id) => messagesById.get(id))
    .filter((m): m is Message => !!m)
    .sort((a, b) => (b.ts || 0) - (a.ts || a.id.localeCompare(b.id)));
}

function getSubgoalInsights(
  subgoal: NavigatorSubgoal,
  jobsById: Map<string, Job>,
  messagesById: Map<string, Message>,
  agentNameById: Map<string, string>,
) {
  const jobs = subgoal.jobIds
    .map((id) => jobsById.get(id))
    .filter((j): j is Job => !!j)
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  const latest = jobs[0];
  const messages = getTrackedMessages(subgoal, jobsById, messagesById);
  const latestDelivered = messages.find(
    (m) => m.status === "delivered" && typeof m.response === "string" && m.response.trim().length > 0,
  ) || null;
  const durationMs = latest?.startedAt
    ? (latest.completedAt ? latest.completedAt - latest.startedAt : Date.now() - latest.startedAt)
    : null;
  return {
    totalRuns: jobs.length,
    running: jobs.filter((j) => j.status === "running").length,
    queued: jobs.filter((j) => j.status === "queued").length,
    awaitingInput: jobs.filter((j) => j.status === "awaiting-input").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    totalSteps: latest?.steps?.length ?? 0,
    completedSteps: latest?.steps?.filter((s) => s.status === "completed").length ?? 0,
    activeStep: latest?.steps?.find((s) => s.status === "running")?.name
      || latest?.steps?.find((s) => s.status === "running")?.commandId || null,
    durationMs,
    latest,
    latestJobStatus: latest?.status,
    latestResult: latest?.resultDetails?.summary || latest?.result || null,
    pendingReplies: messages.filter((m) => m.status === "sending").length,
    deliveredReplies: messages.filter((m) => m.status === "delivered").length,
    failedReplies: messages.filter((m) => m.status === "failed").length,
    trackedReplies: messages.length,
    latestDelivered,
    awaitingAgents: Array.from(new Set(
      messages.filter((m) => m.status === "sending")
        .map((m) => agentNameById.get(m.toId) || m.toId.slice(0, 8)),
    )),
  };
}

function getGoalProgress(goal: NavigatorGoal, jobsById: Map<string, Job>) {
  const total = goal.subgoals.length;
  let executing = 0, consulting = 0, runningJobs = 0, queuedJobs = 0, awaitingJobs = 0, failedJobs = 0;
  const done = goal.subgoals.filter((s) => s.status === "completed" || s.status === "skipped").length;
  for (const sub of goal.subgoals) {
    if (sub.status === "executing") executing++;
    if (sub.status === "consulting") consulting++;
    for (const jobId of sub.jobIds) {
      const job = jobsById.get(jobId);
      if (!job) continue;
      if (job.status === "running") runningJobs++;
      if (job.status === "queued") queuedJobs++;
      if (job.status === "awaiting-input") awaitingJobs++;
      if (job.status === "failed") failedJobs++;
    }
  }
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0, executing, consulting, runningJobs, queuedJobs, awaitingJobs, failedJobs };
}

const EXECUTING_SLA_MS = 5 * 60 * 1000;
const BLOCKED_SLA_MS = 2 * 60 * 1000;
const RETRY_ALERT_THRESHOLD = 2;

function buildGoalAlerts(goal: NavigatorGoal): string[] {
  const now = Date.now();
  const alerts: string[] = [];
  const slow = goal.subgoals.filter((s) => s.status === "executing" && s.startedAt && now - s.startedAt > EXECUTING_SLA_MS);
  if (slow.length) alerts.push(`${slow.length} sub-goal(s) executing past SLA`);
  const blocked = goal.subgoals.filter((s) => s.status === "blocked" && s.lastTransitionAt && now - s.lastTransitionAt > BLOCKED_SLA_MS);
  if (blocked.length) alerts.push(`${blocked.length} blocked sub-goal(s) past SLA`);
  const retries = goal.subgoals.filter((s) => (s.retries || 0) >= RETRY_ALERT_THRESHOLD);
  if (retries.length) alerts.push(`${retries.length} sub-goal(s) with repeated retries`);
  return alerts;
}

function isLifecycleErrorEvent(ev: NavigatorLifecycleEvent): boolean {
  const to = (ev.toStatus || "").toLowerCase();
  const msg = (ev.message || "").toLowerCase();
  return to === "failed" || to === "blocked" || msg.includes("error") || msg.includes("failed") || msg.includes("blocked");
}

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

interface AgentOption { id: string; name: string }
interface HuddleOption { id: string; label: string }
type SubgoalControlAction = "pause" | "resume" | "complete" | "fail" | "block" | "retry" | "skip";

// ─────────────────────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function HuddleCard({ huddle }: { huddle: NavigatorHuddle }) {
  return (
    <div className="nav2-huddle">
      <div className="nav2-huddle__head">
        <Users size={13} />
        <span className="nav2-huddle__title">Huddle</span>
        <StatusPill status={huddle.status} />
      </div>
      <div className="nav2-huddle__meta">
        {huddle.members.length} member(s) · {huddle.networkIds.length} network(s)
      </div>
      {huddle.decision ? <div className="nav2-huddle__decision">{huddle.decision}</div> : null}
    </div>
  );
}

function SubgoalRow({
  index, subgoal, agents, huddles, jobsById, messagesById, agentNameById, onStart, onControl,
}: {
  index: number;
  subgoal: NavigatorSubgoal;
  agents: AgentOption[];
  huddles: HuddleOption[];
  jobsById: Map<string, Job>;
  messagesById: Map<string, Message>;
  agentNameById: Map<string, string>;
  onStart: (sg: NavigatorSubgoal) => void;
  onControl: (sg: NavigatorSubgoal, action: SubgoalControlAction) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const assignedName = subgoal.assignedAgentId
    ? agents.find((a) => a.id === subgoal.assignedAgentId)?.name ?? subgoal.assignedAgentId.slice(0, 6)
    : null;
  const huddleLabel = subgoal.huddleId
    ? huddles.find((h) => h.id === subgoal.huddleId)?.label ?? "huddle"
    : null;
  const hasAssignee = !!subgoal.assignedAgentId || !!subgoal.huddleId;
  const canStart = hasAssignee && subgoal.status !== "executing" && subgoal.status !== "completed";
  const ins = getSubgoalInsights(subgoal, jobsById, messagesById, agentNameById);
  const isTerminal = subgoal.status === "completed" || subgoal.status === "skipped";

  return (
    <li className={`nav2-subgoal nav2-subgoal--${subgoal.status}`}>
      {/* Header row */}
      <div className="nav2-subgoal__header">
        <button
          type="button"
          className="nav2-subgoal__expand"
          aria-expanded={expanded}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="nav2-subgoal__index">#{index + 1}</span>
        <StatusPill status={subgoal.status} />
        <span className="nav2-subgoal__title">{subgoal.title}</span>
        {assignedName
          ? <span className="nav2-subgoal__assignee" title="Assigned agent">→ {assignedName}</span>
          : huddleLabel
            ? <span className="nav2-subgoal__assignee" title="Assigned huddle">⇒ {huddleLabel}</span>
            : null}
        {!isTerminal
          ? <button
              type="button"
              className="nav2-subgoal__start-btn"
              disabled={!canStart}
              title={canStart ? "Start this sub-goal" : "Assign an agent or huddle first"}
              onClick={(e) => { e.stopPropagation(); onStart(subgoal); }}
            >
              <Play size={10} /> Start
            </button>
          : null}
        {isTerminal && subgoal.status === "completed"
          ? <CheckCheck size={13} className="nav2-subgoal__done-icon" />
          : null}
      </div>

      {/* Expanded body */}
      {expanded ? (
        <div className="nav2-subgoal__body">
          {subgoal.instruction ? (
            <p className="nav2-subgoal__instruction">{subgoal.instruction}</p>
          ) : null}

          {ins.totalRuns > 0 ? (
            <div className="nav2-subgoal__metrics-row">
              <span className="nav2-chip">runs: {ins.totalRuns}</span>
              <span className="nav2-chip">done: {ins.completed}</span>
              {ins.running > 0 ? <span className="nav2-chip nav2-chip--active">running: {ins.running}</span> : null}
              {ins.queued > 0 ? <span className="nav2-chip">queued: {ins.queued}</span> : null}
              {ins.awaitingInput > 0 ? <span className="nav2-chip nav2-chip--warn">awaiting: {ins.awaitingInput}</span> : null}
              {ins.failed > 0 ? <span className="nav2-chip nav2-chip--err">failed: {ins.failed}</span> : null}
              {ins.totalSteps > 0 ? <span className="nav2-chip">steps: {ins.completedSteps}/{ins.totalSteps}</span> : null}
              {ins.durationMs != null ? <span className="nav2-chip">dur: {formatDurationMs(ins.durationMs)}</span> : null}
              {ins.trackedReplies > 0 ? <span className="nav2-chip">replies: {ins.deliveredReplies}/{ins.trackedReplies}</span> : null}
              {ins.pendingReplies > 0 ? <span className="nav2-chip nav2-chip--info">pending: {ins.pendingReplies}</span> : null}
              {ins.failedReplies > 0 ? <span className="nav2-chip nav2-chip--err">reply failures: {ins.failedReplies}</span> : null}
            </div>
          ) : null}

          {ins.latestJobStatus ? (
            <div className="nav2-subgoal__latest-job">
              <span className="nav2-subgoal__latest-job-label">Latest job</span>
              <StatusPill status={ins.latestJobStatus} />
              <code className="nav2-subgoal__jobid">{ins.latest?.id.slice(0, 12)}</code>
              {ins.activeStep ? <span className="nav2-subgoal__active-step">· {ins.activeStep}</span> : null}
            </div>
          ) : null}

          {ins.latestResult ? (
            <div className="nav2-subgoal__result">
              {ins.latestResult.length > 240 ? `${ins.latestResult.slice(0, 240)}…` : ins.latestResult}
            </div>
          ) : null}

          {ins.latestDelivered ? (
            <div className="nav2-subgoal__reply">
              <div className="nav2-subgoal__reply-from">
                Reply from {agentNameById.get(ins.latestDelivered.toId) || ins.latestDelivered.toId.slice(0, 8)}
              </div>
              <div className="nav2-subgoal__reply-body">
                {String(ins.latestDelivered.response).length > 280
                  ? `${String(ins.latestDelivered.response).slice(0, 280)}…`
                  : String(ins.latestDelivered.response)}
              </div>
            </div>
          ) : null}

          {ins.pendingReplies > 0 ? (
            <div className="nav2-subgoal__awaiting">
              Awaiting {ins.pendingReplies} repl{ins.pendingReplies === 1 ? "y" : "ies"}
              {ins.awaitingAgents.length > 0 ? ` from: ${ins.awaitingAgents.join(", ")}` : ""}
            </div>
          ) : null}

          {!isTerminal ? (
            <div className="nav2-subgoal__controls">
              {subgoal.status === "executing"
                ? <button type="button" className="nav2-ctl nav2-ctl--warn" onClick={() => onControl(subgoal, "pause")}><Pause size={10} /> Pause</button>
                : <button type="button" className="nav2-ctl" onClick={() => onControl(subgoal, "resume")}><Play size={10} /> Resume</button>}
              <button type="button" className="nav2-ctl nav2-ctl--ok" onClick={() => onControl(subgoal, "complete")}><CheckCircle size={10} /> Complete</button>
              <button type="button" className="nav2-ctl nav2-ctl--warn" onClick={() => onControl(subgoal, "block")}><AlertTriangle size={10} /> Block</button>
              <button type="button" className="nav2-ctl" onClick={() => onControl(subgoal, "retry")}><RotateCcw size={10} /> Retry</button>
              <button type="button" className="nav2-ctl nav2-ctl--muted" onClick={() => onControl(subgoal, "skip")}><SkipForward size={10} /> Skip</button>
            </div>
          ) : null}

          {subgoal.error ? <div className="nav2-subgoal__error">{subgoal.error}</div> : null}
          {subgoal.reason && !subgoal.error ? <div className="nav2-subgoal__reason">{subgoal.reason}</div> : null}
        </div>
      ) : null}
    </li>
  );
}

function AddSubgoalForm({ goalId, agents, huddles, onAdded, onCancel }: {
  goalId: string;
  agents: AgentOption[];
  huddles: HuddleOption[];
  onAdded: () => void;
  onCancel: () => void;
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
    setTitle(""); setInstruction(""); setAssignedAgentId(""); setHuddleId("");
    onAdded();
  };

  return (
    <form className="nav2-add-form" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
      <div className="nav2-add-form__title-row">
        <input
          className="nav2-add-form__input"
          placeholder="Sub-goal title…"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="button" className="nav2-ctl nav2-ctl--muted" onClick={(e) => { e.stopPropagation(); onCancel(); }}>
          <X size={11} />
        </button>
      </div>
      <input
        className="nav2-add-form__input"
        placeholder="Instruction (sent to assignee)"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <div className="nav2-add-form__row">
        <select
          className="nav2-add-form__select"
          value={assignedAgentId}
          onChange={(e) => { setAssignedAgentId(e.target.value); if (e.target.value) setHuddleId(""); }}
        >
          <option value="">Assign agent…</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select
          className="nav2-add-form__select"
          value={huddleId}
          onChange={(e) => { setHuddleId(e.target.value); if (e.target.value) setAssignedAgentId(""); }}
        >
          <option value="">…or huddle</option>
          {huddles.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>
        <button type="submit" className="nav2-add-form__submit" disabled={!title.trim()}>
          <Plus size={11} /> Add sub-goal
        </button>
      </div>
    </form>
  );
}

function GoalCard({
  goal, huddles, agents, jobsById, messagesById, agentNameById,
  isActive, onSelect, onCancel, onRemove, onStartSubgoal, onControlSubgoal, onArchive,
}: {
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
  onArchive: () => void;
}) {
  const [collapsed, setCollapsed] = useState(!isActive);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showLifecycle, setShowLifecycle] = useState(false);
  const [lifecycleErrorsOnly, setLifecycleErrorsOnly] = useState(false);
  const [lifecycleSubgoalFilter, setLifecycleSubgoalFilter] = useState<string>("all");

  const huddleOptions: HuddleOption[] = huddles.map((h) => ({ id: h.id, label: `huddle (${h.members.length})` }));
  const progress = getGoalProgress(goal, jobsById);
  const alerts = buildGoalAlerts(goal);
  const isTerminal = goal.status === "completed" || goal.status === "cancelled" || goal.status === "failed";

  const lifecycleEvents = navigatorService.getGoalLifecycle(goal.id)
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter((ev) => {
      if (lifecycleErrorsOnly && !isLifecycleErrorEvent(ev)) return false;
      if (lifecycleSubgoalFilter !== "all" && ev.subgoalId !== lifecycleSubgoalFilter) return false;
      return true;
    })
    .slice(0, 15);

  return (
    <div
      className={`nav2-goal${isActive ? " nav2-goal--active" : ""}${isTerminal ? ` nav2-goal--terminal-${goal.status}` : ""}`}
      role="article"
      aria-label={`Goal: ${goal.title}`}
    >
      {/* ── Card header — always visible ─────────────────── */}
      <div
        className="nav2-goal__header"
        onClick={() => { setCollapsed((c) => !c); onSelect(); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setCollapsed((c) => !c); onSelect(); } }}
      >
        <button
          type="button"
          className="nav2-goal__chevron"
          aria-expanded={!collapsed}
          onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <Target size={14} className="nav2-goal__icon" />
        <span className="nav2-goal__title">{goal.title}</span>
        <StatusPill status={goal.status} />
        <div className="nav2-goal__header-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="nav2-goal__action-btn nav2-goal__action-btn--archive"
            title="Archive goal as artifact"
            onClick={onArchive}
          >
            <Archive size={12} />
          </button>
          <button
            type="button"
            className="nav2-goal__action-btn"
            title="Cancel goal"
            onClick={onCancel}
            disabled={goal.status === "cancelled" || goal.status === "completed"}
          >
            <X size={12} />
          </button>
          <button
            type="button"
            className="nav2-goal__action-btn nav2-goal__action-btn--danger"
            title="Remove goal"
            onClick={onRemove}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* ── Progress bar — always visible ────────────────── */}
      {progress.total > 0 ? (
        <div className="nav2-goal__progress-row">
          <div className="nav2-goal__progress-bar">
            <div className="nav2-goal__progress-fill" style={{ width: `${progress.pct}%` }} />
          </div>
          <span className="nav2-goal__progress-label">{progress.done}/{progress.total} · {progress.pct}%</span>
        </div>
      ) : null}

      {/* ── Alerts — always visible ───────────────────────── */}
      {alerts.length > 0 ? (
        <div className="nav2-goal__alerts">
          {alerts.map((alert, i) => (
            <div key={`${goal.id}-a-${i}`} className="nav2-goal__alert"><AlertTriangle size={11} /> {alert}</div>
          ))}
        </div>
      ) : null}

      {/* ── Expanded body ─────────────────────────────────── */}
      {!collapsed ? (
        <div className="nav2-goal__body">
          <p className="nav2-goal__prompt">{goal.prompt}</p>

          {/* Quick stats */}
          <div className="nav2-goal__stats-row">
            <span className="nav2-chip">subgoals: {goal.subgoals.length}</span>
            {progress.executing > 0 ? <span className="nav2-chip nav2-chip--active">executing: {progress.executing}</span> : null}
            {progress.consulting > 0 ? <span className="nav2-chip nav2-chip--info">consulting: {progress.consulting}</span> : null}
            {progress.runningJobs > 0 ? <span className="nav2-chip nav2-chip--active">running jobs: {progress.runningJobs}</span> : null}
            {progress.queuedJobs > 0 ? <span className="nav2-chip">queued: {progress.queuedJobs}</span> : null}
            {progress.awaitingJobs > 0 ? <span className="nav2-chip nav2-chip--warn">awaiting input: {progress.awaitingJobs}</span> : null}
            {progress.failedJobs > 0 ? <span className="nav2-chip nav2-chip--err">failed jobs: {progress.failedJobs}</span> : null}
            <span className="nav2-chip nav2-chip--muted" title="DIDComm thread id">thid: {goal.thid.slice(0, 8)}</span>
          </div>

          {goal.synthesis ? (
            <div className="nav2-goal__synthesis">
              <div className="nav2-goal__synthesis-label">Synthesis</div>
              {goal.synthesis}
            </div>
          ) : null}
          {goal.error ? <div className="nav2-goal__error">{goal.error}</div> : null}

          {/* ── Sub-goals ─────────────────────────────────── */}
          <div className="nav2-goal__subgoals-section">
            <div className="nav2-goal__section-head">
              <span>Sub-goals{goal.subgoals.length > 0 ? ` (${goal.subgoals.length})` : ""}</span>
              {!isTerminal ? (
                <button
                  type="button"
                  className="nav2-btn-ghost"
                  onClick={(e) => { e.stopPropagation(); setShowAddForm((v) => !v); }}
                >
                  <Plus size={11} /> {showAddForm ? "Cancel" : "Add"}
                </button>
              ) : null}
            </div>
            {goal.subgoals.length > 0 ? (
              <ul className="nav2-subgoal-list">
                {goal.subgoals.map((s, i) => (
                  <SubgoalRow
                    key={s.id}
                    index={i}
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
            ) : (
              <p className="nav2-text-muted nav2-goal__no-subgoals">No sub-goals yet. Add one to get started.</p>
            )}
            {showAddForm && !isTerminal ? (
              <AddSubgoalForm
                goalId={goal.id}
                agents={agents}
                huddles={huddleOptions}
                onAdded={() => setShowAddForm(false)}
                onCancel={() => setShowAddForm(false)}
              />
            ) : null}
          </div>

          {/* ── Huddles ───────────────────────────────────── */}
          {huddles.length > 0 ? (
            <div className="nav2-goal__huddles-section">
              <div className="nav2-goal__section-head">
                <Users size={12} /> <span>Huddles ({huddles.length})</span>
              </div>
              <div className="nav2-goal__huddles">
                {huddles.map((h) => <HuddleCard key={h.id} huddle={h} />)}
              </div>
            </div>
          ) : null}

          {/* ── Lifecycle ─────────────────────────────────── */}
          {lifecycleEvents.length > 0 ? (
            <div className="nav2-goal__lifecycle-section">
              <button
                type="button"
                className="nav2-goal__lifecycle-toggle"
                onClick={(e) => { e.stopPropagation(); setShowLifecycle((v) => !v); }}
              >
                {showLifecycle ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Lifecycle ({lifecycleEvents.length} event{lifecycleEvents.length !== 1 ? "s" : ""})
              </button>
              {showLifecycle ? (
                <div className="nav2-lifecycle">
                  <div className="nav2-lifecycle__filters">
                    <label className="nav2-lifecycle__filter">
                      <input type="checkbox" checked={lifecycleErrorsOnly} onChange={(e) => setLifecycleErrorsOnly(e.target.checked)} />
                      errors only
                    </label>
                    <select className="nav2-lifecycle__select" value={lifecycleSubgoalFilter} onChange={(e) => setLifecycleSubgoalFilter(e.target.value)}>
                      <option value="all">all subgoals</option>
                      {goal.subgoals.map((s) => <option key={s.id} value={s.id}>{s.title.slice(0, 52)}</option>)}
                    </select>
                  </div>
                  {lifecycleEvents.map((ev) => (
                    <div key={ev.id} className={`nav2-lifecycle__item${isLifecycleErrorEvent(ev) ? " nav2-lifecycle__item--error" : ""}`}>
                      <span className="nav2-lifecycle__time">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                      <span className="nav2-lifecycle__kind">{ev.kind}</span>
                      {ev.subgoalId ? <span className="nav2-lifecycle__sub">sub:{ev.subgoalId.slice(0, 8)}</span> : null}
                      {ev.fromStatus || ev.toStatus
                        ? <span className="nav2-lifecycle__change">{ev.fromStatus || "-"} → {ev.toStatus || "-"}</span>
                        : null}
                      {ev.message ? <span className="nav2-lifecycle__msg">{ev.message}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main view
// ─────────────────────────────────────────────────────────────────────────────

export function NavigatorView() {
  const [snap, setSnap] = useState<NavigatorSnapshot>(() => navigatorService.snapshot());
  const [stopLinkedJobsOnControl, setStopLinkedJobsOnControl] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [archivedGoalId, setArchivedGoalId] = useState<string | null>(null);
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
    for (const m of workspaceCtx?.messages ?? []) map.set(m.id, m);
    return map;
  }, [workspaceCtx?.messages]);
  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of workspaceCtx?.agents ?? []) map.set(a.id, a.name);
    return map;
  }, [workspaceCtx?.agents]);

  const filteredGoals = useMemo(
    () => statusFilter === "all" ? snap.goals : snap.goals.filter((g) => g.status === statusFilter),
    [snap.goals, statusFilter],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of snap.goals) counts[g.status] = (counts[g.status] || 0) + 1;
    return counts;
  }, [snap.goals]);

  const startSubgoal = (goalId: string) => (sub: NavigatorSubgoal) => {
    if (!jobsCtx) return;
    const instruction = sub.instruction || sub.title;
    if (sub.assignedAgentId) {
      const job = jobsCtx.addJob({
        type: "send_message",
        request: { from_agent_id: "user", to_agent_id: sub.assignedAgentId, message: `[Navigator goal ${goalId} · sub-goal ${sub.id}] ${instruction}` },
      });
      navigatorService.updateSubgoal(goalId, sub.id, { status: "executing", jobIds: [...sub.jobIds, job.id] });
    } else if (sub.huddleId) {
      const huddle = navigatorService.listHuddlesForGoal(goalId).find((h) => h.id === sub.huddleId);
      if (!huddle) {
        navigatorService.controlSubgoal(goalId, sub.id, { status: "blocked", reason: `Huddle ${sub.huddleId} not found`, actor: "navigator", note: `Start requested but huddle ${sub.huddleId} is missing` });
        return;
      }
      const groupId = huddle.groupId.startsWith("job:") ? huddle.groupId.slice(4) : huddle.groupId;
      const job = jobsCtx.addJob({
        type: "broadcast_message",
        request: { group_id: groupId, message: `[Navigator goal ${goalId} · sub-goal ${sub.id} · huddle ${huddle.id}] ${instruction}` },
      });
      navigatorService.updateSubgoal(goalId, sub.id, { status: "executing", jobIds: [...sub.jobIds, job.id] });
    }
  };

  const controlSubgoal = (goalId: string) => (sub: NavigatorSubgoal, action: SubgoalControlAction) => {
    const stopActiveJobs = (): string[] => {
      if (!stopLinkedJobsOnControl) return [];
      return sub.jobIds.filter((jobId) => {
        const job = jobsCtx.jobs.find((j) => j.id === jobId);
        if (!job || (job.status !== "running" && job.status !== "awaiting-input")) return false;
        jobsCtx.stopJob(jobId);
        return true;
      });
    };

    const stopped = (["pause", "fail", "block", "skip"] as SubgoalControlAction[]).includes(action)
      ? stopActiveJobs() : [];
    const stoppedNote = stopped.length > 0 ? `; stopped ${stopped.length} linked job(s)` : "";

    const actMap: Record<SubgoalControlAction, () => void> = {
      pause:    () => navigatorService.controlSubgoal(goalId, sub.id, { status: "paused",    reason: "Paused from Navigator UI",  actor: "operator", note: `Paused from UI${stoppedNote}` }),
      resume:   () => navigatorService.controlSubgoal(goalId, sub.id, { status: sub.assignedAgentId || sub.huddleId ? "assigned" : "pending", reason: "Resumed from UI", actor: "operator", note: "Resumed from UI" }),
      complete: () => navigatorService.controlSubgoal(goalId, sub.id, { status: "completed", result: "Marked complete from Navigator UI", actor: "operator", note: "Marked complete from UI" }),
      fail:     () => navigatorService.controlSubgoal(goalId, sub.id, { status: "failed",    error:  "Marked failed from Navigator UI", actor: "operator", note: `Marked failed from UI${stoppedNote}` }),
      block:    () => navigatorService.controlSubgoal(goalId, sub.id, { status: "blocked",   reason: "Blocked from Navigator UI", actor: "operator", note: `Blocked from UI${stoppedNote}` }),
      retry:    () => navigatorService.controlSubgoal(goalId, sub.id, { status: sub.assignedAgentId || sub.huddleId ? "assigned" : "pending", incrementRetries: true, reason: "Retry from UI", actor: "operator", note: "Retry from UI" }),
      skip:     () => navigatorService.controlSubgoal(goalId, sub.id, { status: "skipped",   reason: "Skipped from Navigator UI", actor: "operator", note: `Skipped from UI${stoppedNote}` }),
    };
    actMap[action]();
  };

  const archiveGoal = (goal: NavigatorGoal) => {
    const { artifact } = buildGoalArchiveArtifact({ goal });
    jobsCtx.importArtifact(artifact);
    setArchivedGoalId(goal.id);
    setTimeout(() => setArchivedGoalId(null), 2500);
  };

  return (
    <div className="nav2-root">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="nav2-header">
        <div className="nav2-header__left">
          <h2 className="nav2-title">
            <GradientIcon icon={Compass} size={20} gradient={["#22d3ee", "#3b82f6"]} />
            Navigator
          </h2>
          <p className="nav2-subtitle">
            Plan goals, break them into sub-goals, and dispatch work to agents or huddles.
          </p>
        </div>
        <div className="nav2-header__right">
          <div className="nav2-stats">
            <span><strong>{snap.goals.length}</strong> goal{snap.goals.length !== 1 ? "s" : ""}</span>
            <span><strong>{snap.huddles.length}</strong> huddle{snap.huddles.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────────── */}
      {snap.goals.length > 0 ? (
        <div className="nav2-toolbar">
          <div className="nav2-toolbar__filters">
            <span className="nav2-toolbar__label">Filter:</span>
            {["all", "draft", "planning", "executing", "blocked", "completed", "failed", "cancelled"].map((s) => (
              <button
                key={s}
                type="button"
                className={`nav2-filter-btn${statusFilter === s ? " nav2-filter-btn--active" : ""}`}
                onClick={() => setStatusFilter(s)}
              >
                {s}{s !== "all" && statusCounts[s] ? ` (${statusCounts[s]})` : ""}
              </button>
            ))}
          </div>
          <label className="nav2-toolbar__toggle">
            <input type="checkbox" checked={stopLinkedJobsOnControl} onChange={(e) => setStopLinkedJobsOnControl(e.target.checked)} />
            stop linked jobs on pause/block/fail/skip
          </label>
        </div>
      ) : null}

      {/* ── Archive toast ─────────────────────────────────── */}
      {archivedGoalId ? (
        <div className="nav2-toast" role="status">
          <Package size={13} /> Goal archived as artifact
        </div>
      ) : null}

      {/* ── Content ────────────────────────────────────────── */}
      {snap.goals.length === 0 ? (
        <div className="nav2-empty">
          <Compass size={30} className="nav2-empty__icon" />
          <div className="nav2-empty__title">No goals yet</div>
          <p className="nav2-empty__desc">
            Open the chat panel and ask the Navigator to accomplish something.
            Sub-goals and huddles will appear here as the plan unfolds.
          </p>
        </div>
      ) : filteredGoals.length === 0 ? (
        <div className="nav2-empty">
          <div className="nav2-empty__title">No goals match filter &ldquo;{statusFilter}&rdquo;</div>
        </div>
      ) : (
        <div className="nav2-list">
          {filteredGoals.map((g) => (
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
              onArchive={() => archiveGoal(g)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
