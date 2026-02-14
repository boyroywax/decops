import type { Role, ChannelType, GovernanceModel, PromptTemplate, ScenarioPreset } from "../types";

export const ROLES: Role[] = [
  { id: "researcher", label: "Researcher", icon: "🔬", color: "#00e5a0" },
  { id: "builder", label: "Builder", icon: "⚡", color: "#fbbf24" },
  { id: "curator", label: "Curator", icon: "📦", color: "#a78bfa" },
  { id: "validator", label: "Validator", icon: "🛡️", color: "#38bdf8" },
  { id: "orchestrator", label: "Orchestrator", icon: "🌐", color: "#f472b6" },
];

export const CHANNEL_TYPES: ChannelType[] = [
  { id: "data", label: "Data Sync", icon: "⟳" },
  { id: "task", label: "Task Relay", icon: "⚙️" },
  { id: "consensus", label: "Consensus", icon: "🤝" },
];

export const GOVERNANCE_MODELS: GovernanceModel[] = [
  { id: "majority", label: "Majority Vote", icon: "🗳️", desc: "Simple >50% consensus" },
  { id: "threshold", label: "Threshold Sig", icon: "🔐", desc: "M-of-N multisig required" },
  { id: "delegated", label: "Delegated", icon: "👤", desc: "Elected lead with veto" },
  { id: "unanimous", label: "Unanimous", icon: "✦", desc: "All members must agree" },
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
    icon: "🔐",
    color: "#38bdf8",
    desc: "A multi-agent team that audits smart contracts, analyzes on-chain data, and produces security reports.",
  },
  {
    id: "research-lab",
    label: "Research Lab",
    icon: "🧬",
    color: "#00e5a0",
    desc: "Autonomous research pipeline — literature review, hypothesis generation, experiment design, and peer review.",
  },
  {
    id: "content-studio",
    label: "Content Studio",
    icon: "🎨",
    color: "#f472b6",
    desc: "A creative agency mesh for ideation, drafting, editing, fact-checking, and publication.",
  },
  {
    id: "incident-response",
    label: "Incident Response",
    icon: "🚨",
    color: "#ef4444",
    desc: "Security operations team that triages alerts, investigates threats, coordinates remediation, and writes postmortems.",
  },
  {
    id: "startup-ops",
    label: "Startup Operations",
    icon: "🚀",
    color: "#fbbf24",
    desc: "CEO, CTO, CFO, and Marketing agents collaborating on strategy, roadmap, budgets, and go-to-market.",
  },
  {
    id: "supply-chain",
    label: "Supply Chain DAO",
    icon: "📦",
    color: "#a78bfa",
    desc: "Decentralized supply chain with procurement, logistics, quality assurance, and compliance agents under threshold governance.",
  },
];

export const NETWORK_COLORS = ["#00e5a0", "#38bdf8", "#f472b6", "#fbbf24", "#a78bfa", "#fb923c", "#34d399", "#ef4444"];

export const GROUP_COLORS = ["#f472b6", "#fb923c", "#34d399", "#60a5fa", "#c084fc", "#fbbf24"];
