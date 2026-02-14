import React from "react";
import {
  Microscope, Zap, Package, Shield, Globe,
  RefreshCw, Settings, Handshake,
  Vote, Lock, User, Sparkles,
  Dna, Palette, Siren, Rocket,
} from "lucide-react";
import { GradientIcon } from "../components/shared/GradientIcon";
import type { Role, ChannelType, GovernanceModel, PromptTemplate, ScenarioPreset } from "../types";

export const ROLES: Role[] = [
  { id: "researcher", label: "Researcher", char: "R", icon: <GradientIcon icon={Microscope} size={16} gradient={["#00e5a0", "#34d399"]} />, color: "#00e5a0" },
  { id: "builder", label: "Builder", char: "B", icon: <GradientIcon icon={Zap} size={16} gradient={["#fbbf24", "#fb923c"]} />, color: "#fbbf24" },
  { id: "curator", label: "Curator", char: "C", icon: <GradientIcon icon={Package} size={16} gradient={["#a78bfa", "#c084fc"]} />, color: "#a78bfa" },
  { id: "validator", label: "Validator", char: "V", icon: <GradientIcon icon={Shield} size={16} gradient={["#38bdf8", "#60a5fa"]} />, color: "#38bdf8" },
  { id: "orchestrator", label: "Orchestrator", char: "O", icon: <GradientIcon icon={Globe} size={16} gradient={["#f472b6", "#fb7185"]} />, color: "#f472b6" },
];

export const CHANNEL_TYPES: ChannelType[] = [
  { id: "data", label: "Data Sync", icon: <GradientIcon icon={RefreshCw} size={14} gradient={["#00e5a0", "#38bdf8"]} /> },
  { id: "task", label: "Task Relay", icon: <GradientIcon icon={Settings} size={14} gradient={["#a78bfa", "#f472b6"]} /> },
  { id: "consensus", label: "Consensus", icon: <GradientIcon icon={Handshake} size={14} gradient={["#fbbf24", "#fb923c"]} /> },
];

export const GOVERNANCE_MODELS: GovernanceModel[] = [
  { id: "majority", label: "Majority Vote", icon: <GradientIcon icon={Vote} size={14} gradient={["#00e5a0", "#38bdf8"]} />, desc: "Simple >50% consensus" },
  { id: "threshold", label: "Threshold Sig", icon: <GradientIcon icon={Lock} size={14} gradient={["#fbbf24", "#fb923c"]} />, desc: "M-of-N multisig required" },
  { id: "delegated", label: "Delegated", icon: <GradientIcon icon={User} size={14} gradient={["#a78bfa", "#c084fc"]} />, desc: "Elected lead with veto" },
  { id: "unanimous", label: "Unanimous", icon: <GradientIcon icon={Sparkles} size={14} gradient={["#f472b6", "#fb7185"]} />, desc: "All members must agree" },
];

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  { label: "Custom", prompt: "" },
  { label: "Data Analyst", prompt: "You analyze datasets, identify patterns, and produce statistical summaries. Prioritize accuracy and cite data sources. Output structured JSON when sharing findings with peers." },
  { label: "Code Reviewer", prompt: "You review code for security vulnerabilities, performance issues, and adherence to best practices. Flag critical issues first. Provide fix suggestions as diffs." },
  { label: "Research Synthesizer", prompt: "You aggregate findings from multiple agent sources, resolve contradictions, and produce unified reports. Weight sources by their validation scores." },
  { label: "Task Coordinator", prompt: "You break down complex objectives into subtasks, assign them based on agent capabilities, track progress, and escalate blockers. Maintain a DAG of task dependencies." },
  { label: "Knowledge Curator", prompt: "You index, tag, and organize shared knowledge across the group. Maintain a semantic graph of concepts. Surface relevant context when agents query the knowledge base." },
];

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "defi-audit",
    label: "DeFi Security Audit",
    icon: <GradientIcon icon={Lock} size={20} gradient={["#38bdf8", "#60a5fa"]} />,
    color: "#38bdf8",
    desc: "A multi-agent team that audits smart contracts, analyzes on-chain data, and produces security reports.",
  },
  {
    id: "research-lab",
    label: "Research Lab",
    icon: <GradientIcon icon={Dna} size={20} gradient={["#00e5a0", "#34d399"]} />,
    color: "#00e5a0",
    desc: "Autonomous research pipeline — literature review, hypothesis generation, experiment design, and peer review.",
  },
  {
    id: "content-studio",
    label: "Content Studio",
    icon: <GradientIcon icon={Palette} size={20} gradient={["#f472b6", "#fb7185"]} />,
    color: "#f472b6",
    desc: "A creative agency mesh for ideation, drafting, editing, fact-checking, and publication.",
  },
  {
    id: "incident-response",
    label: "Incident Response",
    icon: <GradientIcon icon={Siren} size={20} gradient={["#ef4444", "#f87171"]} />,
    color: "#ef4444",
    desc: "Security operations team that triages alerts, investigates threats, coordinates remediation, and writes postmortems.",
  },
  {
    id: "startup-ops",
    label: "Startup Operations",
    icon: <GradientIcon icon={Rocket} size={20} gradient={["#fbbf24", "#fb923c"]} />,
    color: "#fbbf24",
    desc: "CEO, CTO, CFO, and Marketing agents collaborating on strategy, roadmap, budgets, and go-to-market.",
  },
  {
    id: "supply-chain",
    label: "Supply Chain DAO",
    icon: <GradientIcon icon={Package} size={20} gradient={["#a78bfa", "#c084fc"]} />,
    color: "#a78bfa",
    desc: "Decentralized supply chain with procurement, logistics, quality assurance, and compliance agents under threshold governance.",
  },
];

export const NETWORK_COLORS = ["#00e5a0", "#38bdf8", "#f472b6", "#fbbf24", "#a78bfa", "#fb923c", "#34d399", "#ef4444"];

export const GROUP_COLORS = ["#f472b6", "#fb923c", "#34d399", "#60a5fa", "#c084fc", "#fbbf24"];

export const ANTHROPIC_MODELS = [
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", desc: "Best balance of speed and intelligence", tier: "recommended" },
  { id: "claude-opus-4-20250514", label: "Claude Opus 4", desc: "Most capable model for complex tasks", tier: "premium" },
  { id: "claude-haiku-3-5-20241022", label: "Claude 3.5 Haiku", desc: "Fastest and most affordable", tier: "fast" },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", desc: "Previous generation balanced model", tier: "standard" },
] as const;
