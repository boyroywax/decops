import { useState, useCallback, useRef, useEffect } from "react";

const generateDID = () => {
  const chars = "abcdef0123456789";
  const id = Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `did:peer:${id.slice(0, 8)}...${id.slice(-6)}`;
};
const generateKeyPair = () => {
  const hex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  return { pub: `0x${hex(12)}...`, priv: `••••••${hex(4)}` };
};
const generateGroupDID = () => {
  const chars = "abcdef0123456789";
  const id = Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `did:group:${id.slice(0, 10)}...${id.slice(-6)}`;
};
const generateNetworkDID = () => {
  const chars = "abcdef0123456789";
  const id = Array.from({ length: 48 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `did:network:${id.slice(0, 12)}...${id.slice(-6)}`;
};
const NETWORK_COLORS = ["#00e5a0", "#38bdf8", "#f472b6", "#fbbf24", "#a78bfa", "#fb923c", "#34d399", "#ef4444"];

const ROLES = [
  { id: "researcher", label: "Researcher", icon: "🔬", color: "#00e5a0" },
  { id: "builder", label: "Builder", icon: "⚡", color: "#fbbf24" },
  { id: "curator", label: "Curator", icon: "📦", color: "#a78bfa" },
  { id: "validator", label: "Validator", icon: "🛡️", color: "#38bdf8" },
  { id: "orchestrator", label: "Orchestrator", icon: "🌐", color: "#f472b6" },
];
const CHANNEL_TYPES = [
  { id: "data", label: "Data Sync", icon: "⟳" },
  { id: "task", label: "Task Relay", icon: "⚙️" },
  { id: "consensus", label: "Consensus", icon: "🤝" },
];
const GOVERNANCE_MODELS = [
  { id: "majority", label: "Majority Vote", icon: "🗳️", desc: "Simple >50% consensus" },
  { id: "threshold", label: "Threshold Sig", icon: "🔐", desc: "M-of-N multisig required" },
  { id: "delegated", label: "Delegated", icon: "👤", desc: "Elected lead with veto" },
  { id: "unanimous", label: "Unanimous", icon: "✦", desc: "All members must agree" },
];
const PROMPT_TEMPLATES = [
  { label: "Custom", prompt: "" },
  { label: "Data Analyst", prompt: "You analyze datasets, identify patterns, and produce statistical summaries. Prioritize accuracy and cite data sources. Output structured JSON when sharing findings with peers." },
  { label: "Code Reviewer", prompt: "You review code for security vulnerabilities, performance issues, and adherence to best practices. Flag critical issues first. Provide fix suggestions as diffs." },
  { label: "Research Synthesizer", prompt: "You aggregate findings from multiple agent sources, resolve contradictions, and produce unified reports. Weight sources by their validation scores." },
  { label: "Task Coordinator", prompt: "You break down complex objectives into subtasks, assign them based on agent capabilities, track progress, and escalate blockers. Maintain a DAG of task dependencies." },
  { label: "Knowledge Curator", prompt: "You index, tag, and organize shared knowledge across the group. Maintain a semantic graph of concepts. Surface relevant context when agents query the knowledge base." },
];

const SCENARIO_PRESETS = [
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

// ─── Sanitize raw AI text into parseable JSON ───
function sanitizeJSONString(raw) {
  let s = raw.replace(/```json|```/g, "").trim();
  // Find the first { and work from there
  const start = s.indexOf("{");
  if (start === -1) throw new Error("No JSON object found");
  s = s.slice(start);

  // Replace literal newlines/tabs INSIDE string values with spaces
  // Walk char-by-char to only affect content inside quotes
  let result = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { result += c; esc = false; continue; }
    if (c === "\\") { result += c; esc = true; continue; }
    if (c === '"') { inStr = !inStr; result += c; continue; }
    if (inStr && (c === "\n" || c === "\r" || c === "\t")) { result += " "; continue; }
    result += c;
  }
  return result;
}

// ─── Truncate to last complete JSON entry and balance brackets ───
function repairJSON(raw) {
  const s = sanitizeJSONString(raw);
  // Try direct parse
  try { return JSON.parse(s); } catch {}

  // Strategy: find the last successfully closed `}` or `]` at various cut points
  // Walk backwards from the end looking for clean cut points
  const cutTargets = [
    /}\s*]\s*}\s*$/,       // full object close
    /}\s*]\s*,?\s*$/,      // array entry close
    /}\s*,?\s*$/,          // object close
    /]\s*,?\s*$/,          // array close
  ];

  for (const pattern of cutTargets) {
    // Find all matches and try from the last one
    let best = null;
    for (let i = s.length; i > s.length / 2; i--) {
      const slice = s.slice(0, i);
      if (pattern.test(slice)) { best = slice; break; }
    }
    if (!best) continue;
    // Remove trailing commas
    let attempt = best.replace(/,(\s*[}\]])/g, "$1");
    // Balance brackets
    const opens = (attempt.match(/{/g) || []).length;
    const closes = (attempt.match(/}/g) || []).length;
    const openB = (attempt.match(/\[/g) || []).length;
    const closeB = (attempt.match(/]/g) || []).length;
    for (let j = 0; j < openB - closeB; j++) attempt += "]";
    for (let j = 0; j < opens - closes; j++) attempt += "}";
    try { return JSON.parse(attempt); } catch {}
  }

  // Nuclear option: extract each section independently with regex
  try {
    const agentsMatch = s.match(/"agents"\s*:\s*\[([\s\S]*?)\]/);
    const channelsMatch = s.match(/"channels"\s*:\s*\[([\s\S]*?)\]/);
    const groupsMatch = s.match(/"groups"\s*:\s*\[([\s\S]*?)\]/);
    const msgsMatch = s.match(/"exampleMessages"\s*:\s*\[([\s\S]*?)\]/);

    const parseArray = (match) => {
      if (!match) return [];
      let arrStr = "[" + match[1] + "]";
      // Fix trailing commas
      arrStr = arrStr.replace(/,\s*]/g, "]");
      try { return JSON.parse(arrStr); } catch {
        // Try truncating to last complete object
        const lastClose = arrStr.lastIndexOf("}");
        if (lastClose > 0) {
          arrStr = arrStr.slice(0, lastClose + 1) + "]";
          try { return JSON.parse(arrStr); } catch { return []; }
        }
        return [];
      }
    };

    const config = {
      agents: parseArray(agentsMatch),
      channels: parseArray(channelsMatch),
      groups: parseArray(groupsMatch),
      exampleMessages: parseArray(msgsMatch),
    };
    if (config.agents.length > 0) return config;
  } catch {}

  throw new Error("Could not parse AI response — try a simpler description");
}

// ─── AI Mesh Generator ───
async function generateMeshConfig(description) {
  const systemPrompt = `You are a Mesh Workspace Architect. Given a description, output a JSON mesh network config.

RESPOND WITH ONLY VALID JSON. No markdown. No backticks. No explanation. Just the JSON object.

Rules:
- roles must be one of: researcher, builder, curator, validator, orchestrator
- channel types must be one of: data, task, consensus  
- governance must be one of: majority, threshold, delegated, unanimous
- from/to in channels and members in groups are 0-based agent array indices
- Keep ALL string values SHORT — max 30 words per string. No line breaks in strings.
- Create 3-5 agents, 3-6 channels, 1-2 groups, 2-3 example messages

Example output format:
{"agents":[{"name":"Scout","role":"researcher","prompt":"You research topics and report findings concisely."},{"name":"Forge","role":"builder","prompt":"You build solutions from research findings."}],"channels":[{"from":0,"to":1,"type":"data"}],"groups":[{"name":"Core Team","governance":"majority","members":[0,1],"threshold":2}],"exampleMessages":[{"channelIdx":0,"message":"Here are the latest findings on the target topic."}]}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: `Design a mesh network for: ${description}\n\nRespond with ONLY the JSON object. Keep all strings under 30 words. No markdown.` }],
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "API error");
    const text = data.content?.map((b) => b.text || "").join("") || "";
    if (!text.trim()) throw new Error("Empty response from AI");
    const config = repairJSON(text);
    // Validate minimum structure
    if (!config.agents || !Array.isArray(config.agents) || config.agents.length === 0) {
      throw new Error("Generated config has no agents");
    }
    if (!config.channels) config.channels = [];
    if (!config.groups) config.groups = [];
    if (!config.exampleMessages) config.exampleMessages = [];
    return config;
  } catch (err) {
    if (err.message.includes("Generation failed")) throw err;
    throw new Error(`Generation failed: ${err.message}`);
  }
}

// ─── AI Message Passing ───
async function callAgentAI(agent, senderAgent, message, channelType, conversationHistory, crossNetworkCtx) {
  const systemPrompt = [
    `You are "${agent.name}", a ${ROLES.find(r => r.id === agent.role)?.label} agent in a decentralized mesh workspace.`,
    `Your DID: ${agent.did}`,
    `Communication channel type: ${channelType}`,
    agent.prompt ? `\nYour core directive:\n${agent.prompt}` : "",
    crossNetworkCtx ? `\nCROSS-NETWORK BRIDGE: This message comes from "${senderAgent.name}" in the "${crossNetworkCtx}" network. You are in a different network. Acknowledge the cross-network context.` : "",
    `\nYou are receiving a message from "${senderAgent.name}" (${ROLES.find(r => r.id === senderAgent.role)?.label}, DID: ${senderAgent.did}).`,
    `Respond concisely and in-character. Keep responses under 150 words. If you have structured output, use markdown formatting.`,
  ].filter(Boolean).join("\n");

  const messages = [];
  conversationHistory.slice(-6).forEach((m) => {
    messages.push({ role: m.fromId === agent.id ? "assistant" : "user", content: m.content });
    if (m.response && m.fromId !== agent.id) messages.push({ role: "assistant", content: m.response });
  });
  messages.push({ role: "user", content: message });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: systemPrompt, messages }),
    });
    const data = await response.json();
    return data.content?.map((b) => b.text || "").join("\n") || "[No response]";
  } catch (err) {
    return `[Agent error: ${err.message}]`;
  }
}

// ─── Network Canvas ───
function NetworkCanvas({ agents, channels, groups, activeChannels }) {
  const canvasRef = useRef(null);
  const animFrame = useRef(null);
  const positions = useRef({});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const cw = w / 2, ch = h / 2;

    agents.forEach((a, i) => {
      if (!positions.current[a.id]) {
        const angle = (i / Math.max(agents.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const r = Math.min(cw, ch) * 0.32;
        positions.current[a.id] = { x: cw / 2 + Math.cos(angle) * r, y: ch / 2 + Math.sin(angle) * r };
      }
    });

    let tick = 0;
    const draw = () => {
      tick++;
      ctx.clearRect(0, 0, cw, ch);
      ctx.strokeStyle = "rgba(0,229,160,0.04)"; ctx.lineWidth = 0.5;
      for (let x = 0; x < cw; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
      for (let y = 0; y < ch; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }

      groups.forEach((g) => {
        const mp = g.members.map((mid) => positions.current[mid]).filter(Boolean);
        if (mp.length < 2) return;
        const cx2 = mp.reduce((s, p) => s + p.x, 0) / mp.length;
        const cy2 = mp.reduce((s, p) => s + p.y, 0) / mp.length;
        const maxD = Math.max(...mp.map((p) => Math.sqrt((p.x - cx2) ** 2 + (p.y - cy2) ** 2)));
        const radius = maxD + 40;
        const pulse = Math.sin(tick * 0.02) * 0.15 + 0.85;
        ctx.beginPath();
        ctx.strokeStyle = (g.color || "#f472b6") + Math.round(40 * pulse).toString(16).padStart(2, "0");
        ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
        ctx.arc(cx2, cy2, radius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = "500 8px 'DM Mono', monospace";
        ctx.fillStyle = (g.color || "#f472b6") + "80"; ctx.textAlign = "center";
        ctx.fillText(`⬡ ${g.name}`, cx2, cy2 - radius - 6);
      });

      channels.forEach((ch_item) => {
        const from = positions.current[ch_item.from]; const to = positions.current[ch_item.to];
        if (!from || !to) return;
        const isActive = activeChannels.has(ch_item.id);
        const typeColor = ch_item.type === "data" ? "#00e5a0" : ch_item.type === "task" ? "#fbbf24" : "#a78bfa";
        ctx.beginPath(); ctx.strokeStyle = typeColor + (isActive ? "80" : "40");
        ctx.lineWidth = isActive ? 2.5 : 1.5; ctx.setLineDash(isActive ? [] : [4, 6]);
        ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.setLineDash([]);
        const pulseCount = isActive ? 3 : 1;
        for (let p = 0; p < pulseCount; p++) {
          const progress = ((tick * (isActive ? 1.5 : 0.8) + ch_item.offset + p * 40) % 120) / 120;
          const px = from.x + (to.x - from.x) * progress; const py = from.y + (to.y - from.y) * progress;
          ctx.beginPath(); ctx.fillStyle = typeColor + (isActive ? "ff" : "cc");
          ctx.arc(px, py, isActive ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
        }
        if (isActive) {
          const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          const glowR = 12 + Math.sin(tick * 0.1) * 4;
          const glow = ctx.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, glowR);
          glow.addColorStop(0, typeColor + "40"); glow.addColorStop(1, typeColor + "00");
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(mid.x, mid.y, glowR, 0, Math.PI * 2); ctx.fill();
        }
      });

      agents.forEach((a) => {
        const pos = positions.current[a.id]; if (!pos) return;
        const role = ROLES.find(r => r.id === a.role); const color = role?.color || "#00e5a0";
        const hasPrompt = a.prompt && a.prompt.trim().length > 0;
        const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 28);
        grad.addColorStop(0, color + "30"); grad.addColorStop(1, color + "00");
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(pos.x, pos.y, 28, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = color + "90"; ctx.lineWidth = 1.5;
        ctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2); ctx.stroke();
        if (hasPrompt) { ctx.beginPath(); ctx.strokeStyle = color + "40"; ctx.lineWidth = 0.8; ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2); ctx.stroke(); }
        ctx.beginPath(); ctx.fillStyle = color + "20"; ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2); ctx.fill();
        ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(role?.icon || "●", pos.x, pos.y);
        ctx.font = "600 9px 'DM Mono', monospace"; ctx.fillStyle = "#d4d4d8"; ctx.fillText(a.name, pos.x, pos.y + 26);
      });
      animFrame.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animFrame.current);
  }, [agents, channels, groups, activeChannels]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}

// ─── Ecosystem Canvas ───
function EcosystemCanvas({ networks, bridges, activeBridges }) {
  const canvasRef = useRef(null);
  const animFrame = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const cw = w / 2, ch = h / 2;

    const netPos = {};
    networks.forEach((n, i) => {
      const angle = (i / Math.max(networks.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const r = Math.min(cw, ch) * 0.3;
      netPos[n.id] = { x: cw / 2 + Math.cos(angle) * r, y: ch / 2 + Math.sin(angle) * r };
    });

    let tick = 0;
    const draw = () => {
      tick++;
      ctx.clearRect(0, 0, cw, ch);

      // Grid
      ctx.strokeStyle = "rgba(56,189,248,0.03)";
      ctx.lineWidth = 0.5;
      for (let x = 0; x < cw; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
      for (let y = 0; y < ch; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }

      // Bridges
      bridges.forEach((b) => {
        const f = netPos[b.fromNetworkId], t = netPos[b.toNetworkId];
        if (!f || !t) return;
        const act = activeBridges.has(b.id);

        ctx.beginPath();
        ctx.strokeStyle = act ? "#fbbf2480" : "#fbbf2428";
        ctx.lineWidth = act ? 3 : 2;
        ctx.setLineDash(act ? [] : [8, 6]);
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const pulseCount = act ? 4 : 2;
        for (let p = 0; p < pulseCount; p++) {
          const pr = ((tick * (act ? 1.2 : 0.5) + (b.offset || 0) + p * 30) % 120) / 120;
          const px = f.x + (t.x - f.x) * pr;
          const py = f.y + (t.y - f.y) * pr;
          ctx.beginPath();
          ctx.fillStyle = "#fbbf24" + (act ? "ff" : "88");
          ctx.arc(px, py, act ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
        }

        if (act) {
          const mid = { x: (f.x + t.x) / 2, y: (f.y + t.y) / 2 };
          const gr = 14 + Math.sin(tick * 0.1) * 5;
          const glow = ctx.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, gr);
          glow.addColorStop(0, "#fbbf2440");
          glow.addColorStop(1, "#fbbf2400");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, gr, 0, Math.PI * 2);
          ctx.fill();
        }

        const mid = { x: (f.x + t.x) / 2, y: (f.y + t.y) / 2 };
        ctx.font = "500 7px 'DM Mono', monospace";
        ctx.fillStyle = "#fbbf2450";
        ctx.textAlign = "center";
        ctx.fillText("BRIDGE", mid.x, mid.y - 10);
      });

      // Network nodes
      networks.forEach((n, ni) => {
        const pos = netPos[n.id];
        if (!pos) return;
        const color = n.color || "#00e5a0";
        const agentCount = n.agents.length;
        const nodeR = 28 + Math.min(agentCount, 8) * 3;

        // Outer pulse ring
        const pulseR = nodeR + 12 + Math.sin(tick * 0.015 + ni) * 4;
        ctx.beginPath();
        ctx.strokeStyle = color + "15";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.arc(pos.x, pos.y, pulseR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Glow
        const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, nodeR + 10);
        grad.addColorStop(0, color + "22");
        grad.addColorStop(1, color + "00");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, nodeR + 10, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.beginPath();
        ctx.fillStyle = color + "0c";
        ctx.arc(pos.x, pos.y, nodeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = color + "55";
        ctx.lineWidth = 2;
        ctx.arc(pos.x, pos.y, nodeR, 0, Math.PI * 2);
        ctx.stroke();

        // Inner agent dots
        for (let i = 0; i < Math.min(agentCount, 8); i++) {
          const a = (i / Math.min(agentCount, 8)) * Math.PI * 2 - Math.PI / 2;
          const dr = nodeR * 0.5;
          ctx.beginPath();
          ctx.fillStyle = color + "70";
          ctx.arc(pos.x + Math.cos(a) * dr, pos.y + Math.sin(a) * dr, 3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Center hex icon
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = color + "cc";
        ctx.fillText("⬡", pos.x, pos.y);

        // Name label
        ctx.font = "700 10px 'Space Grotesk', sans-serif";
        ctx.fillStyle = color;
        ctx.fillText(n.name, pos.x, pos.y + nodeR + 16);

        // Stats label
        ctx.font = "400 8px 'DM Mono', monospace";
        ctx.fillStyle = "#71717a";
        ctx.fillText(`${agentCount} agents · ${n.channels.length} ch`, pos.x, pos.y + nodeR + 28);
      });

      animFrame.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animFrame.current);
  }, [networks, bridges, activeBridges]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}

// ─── Shared Styles ───
const inputStyle = {
  background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, padding: "10px 14px", color: "#e4e4e7",
  fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none", width: "100%", resize: "none",
};
const sectionTitle = (text) => (
  <div style={{ fontSize: 9, color: "#52525b", letterSpacing: "0.12em", marginBottom: 10, textTransform: "uppercase" }}>{text}</div>
);
const GROUP_COLORS = ["#f472b6", "#fb923c", "#34d399", "#60a5fa", "#c084fc", "#fbbf24"];
const pillBtn = (active, activeColor, onClick, children) => (
  <button onClick={onClick} style={{
    background: active ? activeColor + "18" : "rgba(0,0,0,0.3)",
    border: `1px solid ${active ? activeColor + "45" : "rgba(255,255,255,0.06)"}`,
    color: active ? activeColor : "#71717a", padding: "8px 12px", borderRadius: 6, cursor: "pointer",
    fontFamily: "inherit", fontSize: 11, transition: "all 0.15s",
  }}>{children}</button>
);

// ─── Main App ───
export default function AgentWorkspace() {
  const [agents, setAgents] = useState([]);
  const [channels, setChannels] = useState([]);
  const [groups, setGroups] = useState([]);
  const [view, setView] = useState("architect");
  const [showCreate, setShowCreate] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: "", role: "researcher", prompt: "", templateIdx: 0 });
  const [channelForm, setChannelForm] = useState({ from: "", to: "", type: "data" });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [editPromptText, setEditPromptText] = useState("");
  const [log, setLog] = useState([]);
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", governance: "majority", members: [], threshold: 2 });
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [msgInput, setMsgInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeChannels, setActiveChannels] = useState(new Set());
  const [broadcastGroup, setBroadcastGroup] = useState(null);
  const [broadcastInput, setBroadcastInput] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const msgEndRef = useRef(null);

  // ─── Workspace Agent State ───
  const [archPrompt, setArchPrompt] = useState("");
  const [archGenerating, setArchGenerating] = useState(false);
  const [archPreview, setArchPreview] = useState(null); // parsed JSON config
  const [archError, setArchError] = useState(null);
  const [archDeployed, setArchDeployed] = useState(false);
  const [archPhase, setArchPhase] = useState("input"); // input | preview | deploying | done
  const [deployProgress, setDeployProgress] = useState({ step: "", count: 0, total: 0 });

  // ─── Ecosystem State ───
  const [ecosystems, setEcosystems] = useState([]); // { id, name, did, color, agents[], channels[], groups[], messages[], createdAt }
  const [bridges, setBridges] = useState([]); // { id, fromNetworkId, toNetworkId, fromAgentId, toAgentId, type, offset, createdAt }
  const [bridgeMessages, setBridgeMessages] = useState([]); // { id, bridgeId, fromId, toId, content, response, status, ts }
  const [activeBridges, setActiveBridges] = useState(new Set());
  const [ecoSaveName, setEcoSaveName] = useState("");
  const [bridgeForm, setBridgeForm] = useState({ fromNet: "", toNet: "", fromAgent: "", toAgent: "", type: "data" });
  const [selectedBridge, setSelectedBridge] = useState(null);
  const [bridgeMsgInput, setBridgeMsgInput] = useState("");
  const [bridgeSending, setBridgeSending] = useState(false);

  const addLog = useCallback((msg) => {
    setLog((prev) => [{ msg, ts: Date.now() }, ...prev].slice(0, 80));
  }, []);

  // ─── Workspace Agent: Generate ───
  const generateNetwork = async (description) => {
    setArchGenerating(true); setArchError(null); setArchPreview(null); setArchPhase("input");
    addLog(`Architect: generating mesh for "${description.slice(0, 50)}…"`);
    try {
      const config = await generateMeshConfig(description);
      // Validate structure
      if (!config.agents || !Array.isArray(config.agents) || config.agents.length === 0) throw new Error("No agents in config");
      if (!config.channels || !Array.isArray(config.channels)) throw new Error("No channels in config");
      setArchPreview(config);
      setArchPhase("preview");
      addLog(`Architect: generated ${config.agents.length} agents, ${config.channels.length} channels, ${config.groups?.length || 0} groups`);
    } catch (err) {
      setArchError(err.message);
      addLog(`Architect error: ${err.message}`);
    }
    setArchGenerating(false);
  };

  // ─── Workspace Agent: Deploy ───
  const deployNetwork = async () => {
    if (!archPreview) return;
    setArchPhase("deploying");
    const config = archPreview;
    const total = config.agents.length + config.channels.length + (config.groups?.length || 0) + (config.exampleMessages?.length || 0);
    let count = 0;

    // 1. Create agents
    const newAgents = [];
    for (const a of config.agents) {
      if (!a || !a.name) continue; // skip malformed entries from JSON repair
      const validRole = ROLES.find(r => r.id === a.role) ? a.role : "researcher";
      const agent = {
        id: crypto.randomUUID(), name: a.name, role: validRole,
        prompt: a.prompt || "", did: generateDID(), keys: generateKeyPair(),
        createdAt: new Date().toISOString(), status: "active",
      };
      newAgents.push(agent);
      count++;
      setDeployProgress({ step: `Creating agent: ${a.name}`, count, total });
      addLog(`Deployed agent "${a.name}" → ${agent.did.slice(0, 20)}…`);
      await new Promise(r => setTimeout(r, 150));
    }
    setAgents((prev) => [...prev, ...newAgents]);

    // 2. Create channels
    const newChannels = [];
    for (const c of config.channels) {
      if (c.from == null || c.to == null) continue; // skip malformed
      const fromAgent = newAgents[c.from]; const toAgent = newAgents[c.to];
      if (!fromAgent || !toAgent) continue;
      const validType = CHANNEL_TYPES.find(t => t.id === c.type) ? c.type : "data";
      const ch = {
        id: crypto.randomUUID(), from: fromAgent.id, to: toAgent.id,
        type: validType, offset: Math.random() * 120, createdAt: new Date().toISOString(),
      };
      newChannels.push(ch);
      count++;
      setDeployProgress({ step: `Channel: ${fromAgent.name} ⟷ ${toAgent.name}`, count, total });
      addLog(`Channel: ${fromAgent.name} ⟷ ${toAgent.name} [${validType}]`);
      await new Promise(r => setTimeout(r, 100));
    }
    setChannels((prev) => [...prev, ...newChannels]);

    // 3. Create groups
    const newGroups = [];
    if (config.groups) {
      for (const g of config.groups) {
        if (!g || !g.name) continue; // skip malformed
        const memberIds = (g.members || []).map(idx => newAgents[idx]?.id).filter(Boolean);
        if (memberIds.length < 2) continue;
        const validGov = GOVERNANCE_MODELS.find(m => m.id === g.governance) ? g.governance : "majority";
        const group = {
          id: crypto.randomUUID(), name: g.name, governance: validGov,
          members: memberIds, threshold: g.threshold || 2,
          did: generateGroupDID(), color: GROUP_COLORS[newGroups.length % GROUP_COLORS.length],
          createdAt: new Date().toISOString(),
        };
        newGroups.push(group);
        count++;
        setDeployProgress({ step: `Group: ${g.name}`, count, total });
        addLog(`Group "${g.name}" formed → ${group.did.slice(0, 22)}…`);
        await new Promise(r => setTimeout(r, 100));

        // Auto-create consensus channels within group
        for (let i = 0; i < memberIds.length; i++) {
          for (let j = i + 1; j < memberIds.length; j++) {
            const exists = [...newChannels].some(c =>
              (c.from === memberIds[i] && c.to === memberIds[j]) || (c.from === memberIds[j] && c.to === memberIds[i])
            );
            if (!exists) {
              const ch = { id: crypto.randomUUID(), from: memberIds[i], to: memberIds[j], type: "consensus", offset: Math.random() * 120, createdAt: new Date().toISOString() };
              newChannels.push(ch);
              setChannels((prev) => [...prev, ch]);
            }
          }
        }
      }
    }
    setGroups((prev) => [...prev, ...newGroups]);

    // 4. Send example messages
    if (config.exampleMessages && config.exampleMessages.length > 0) {
      for (const em of config.exampleMessages) {
        if (em.channelIdx == null || !em.message) continue; // skip malformed
        const ch = newChannels[em.channelIdx];
        if (!ch) continue;
        const fromAgent = newAgents.find(a => a.id === ch.from);
        const toAgent = newAgents.find(a => a.id === ch.to);
        if (!fromAgent || !toAgent) continue;

        count++;
        setDeployProgress({ step: `Message: ${fromAgent.name} → ${toAgent.name}`, count, total });
        addLog(`Example msg: ${fromAgent.name} → ${toAgent.name}`);

        const msgId = crypto.randomUUID();
        const msg = {
          id: msgId, channelId: ch.id, fromId: ch.from, toId: ch.to,
          content: em.message, response: null, status: "sending", ts: Date.now(),
        };
        setMessages((prev) => [...prev, msg]);
        setActiveChannels((prev) => new Set([...prev, ch.id]));

        if (toAgent.prompt) {
          const history = [];
          const response = await callAgentAI(toAgent, fromAgent, em.message, ch.type, history);
          setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response, status: "delivered" } : m));
          addLog(`${toAgent.name} responded (${response.length} chars)`);
        } else {
          setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response: "[No prompt]", status: "no-prompt" } : m));
        }

        setTimeout(() => setActiveChannels((prev) => { const n = new Set(prev); n.delete(ch.id); return n; }), 3000);
        await new Promise(r => setTimeout(r, 200));
      }
    }

    setArchPhase("done");
    setDeployProgress({ step: "Complete", count: total, total });
    addLog(`Mesh network deployed: ${newAgents.length} agents, ${newChannels.length} channels, ${newGroups.length} groups`);
  };

  const resetArchitect = () => {
    setArchPrompt(""); setArchPreview(null); setArchError(null);
    setArchPhase("input"); setArchDeployed(false);
    setDeployProgress({ step: "", count: 0, total: 0 });
  };

  // ─── Ecosystem Functions ───
  const saveCurrentNetwork = () => {
    if (!ecoSaveName.trim() || agents.length === 0) return;
    const net = {
      id: crypto.randomUUID(), name: ecoSaveName.trim(), did: generateNetworkDID(),
      color: NETWORK_COLORS[ecosystems.length % NETWORK_COLORS.length],
      agents: [...agents], channels: [...channels], groups: [...groups], messages: [...messages],
      createdAt: new Date().toISOString(),
    };
    setEcosystems((prev) => [...prev, net]);
    addLog(`Network "${net.name}" saved → ${net.did.slice(0, 24)}…`);
    setEcoSaveName("");
  };

  const loadNetwork = (id) => {
    const net = ecosystems.find((n) => n.id === id);
    if (!net) return;
    setAgents([...net.agents]); setChannels([...net.channels]);
    setGroups([...net.groups]); setMessages([...net.messages]);
    addLog(`Loaded network "${net.name}" into workspace`);
    setView("agents");
  };

  const dissolveNetwork = (id) => {
    setEcosystems((prev) => prev.filter((n) => n.id !== id));
    setBridges((prev) => prev.filter((b) => b.fromNetworkId !== id && b.toNetworkId !== id));
    addLog("Network dissolved from ecosystem");
  };

  const clearWorkspace = () => {
    setAgents([]); setChannels([]); setGroups([]); setMessages([]);
    addLog("Workspace cleared");
  };

  const createBridge = () => {
    const { fromNet, toNet, fromAgent, toAgent, type } = bridgeForm;
    if (!fromNet || !toNet || !fromAgent || !toAgent || fromNet === toNet) return;
    const exists = bridges.some((b) =>
      (b.fromAgentId === fromAgent && b.toAgentId === toAgent) ||
      (b.fromAgentId === toAgent && b.toAgentId === fromAgent)
    );
    if (exists) { addLog("Bridge already exists"); return; }
    const bridge = {
      id: crypto.randomUUID(), fromNetworkId: fromNet, toNetworkId: toNet,
      fromAgentId: fromAgent, toAgentId: toAgent,
      type: CHANNEL_TYPES.find((t) => t.id === type) ? type : "data",
      offset: Math.random() * 120, createdAt: new Date().toISOString(),
    };
    setBridges((prev) => [...prev, bridge]);
    const fNet = ecosystems.find((n) => n.id === fromNet);
    const tNet = ecosystems.find((n) => n.id === toNet);
    const fAgent = fNet?.agents.find((a) => a.id === fromAgent);
    const tAgent = tNet?.agents.find((a) => a.id === toAgent);
    addLog(`Bridge: ${fAgent?.name} (${fNet?.name}) ⟷ ${tAgent?.name} (${tNet?.name})`);
    setBridgeForm({ fromNet: "", toNet: "", fromAgent: "", toAgent: "", type: "data" });
  };

  const removeBridge = (id) => {
    setBridges((prev) => prev.filter((b) => b.id !== id));
    if (selectedBridge === id) setSelectedBridge(null);
    addLog("Bridge dissolved");
  };

  const sendBridgeMessage = async () => {
    if (!bridgeMsgInput.trim() || !selectedBridge || bridgeSending) return;
    const bridge = bridges.find((b) => b.id === selectedBridge);
    if (!bridge) return;
    const fromNet = ecosystems.find((n) => n.id === bridge.fromNetworkId);
    const toNet = ecosystems.find((n) => n.id === bridge.toNetworkId);
    const fromAgent = fromNet?.agents.find((a) => a.id === bridge.fromAgentId);
    const toAgent = toNet?.agents.find((a) => a.id === bridge.toAgentId);
    if (!fromAgent || !toAgent) return;

    const msgId = crypto.randomUUID();
    const msg = {
      id: msgId, bridgeId: bridge.id, fromId: bridge.fromAgentId, toId: bridge.toAgentId,
      content: bridgeMsgInput.trim(), response: null, status: "sending", ts: Date.now(),
    };
    setBridgeMessages((prev) => [...prev, msg]);
    setBridgeMsgInput("");
    setBridgeSending(true);
    setActiveBridges((prev) => new Set([...prev, bridge.id]));
    addLog(`Bridge msg: ${fromAgent.name} → ${toAgent.name} (cross-network)`);

    if (toAgent.prompt) {
      const history = bridgeMessages.filter((m) => m.bridgeId === bridge.id);
      const response = await callAgentAI(toAgent, fromAgent, msg.content, bridge.type, history, fromNet?.name);
      setBridgeMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response, status: "delivered" } : m));
      addLog(`${toAgent.name} responded across bridge`);
    } else {
      setBridgeMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response: "[No prompt — agent cannot respond]", status: "no-prompt" } : m));
    }
    setBridgeSending(false);
    setTimeout(() => setActiveBridges((prev) => { const n = new Set(prev); n.delete(bridge.id); return n; }), 3000);
  };

  // ─── Agent CRUD ───
  const createAgent = () => {
    if (!newAgent.name.trim()) return;
    const agent = { id: crypto.randomUUID(), name: newAgent.name.trim(), role: newAgent.role, prompt: newAgent.prompt.trim(), did: generateDID(), keys: generateKeyPair(), createdAt: new Date().toISOString(), status: "active" };
    setAgents((prev) => [...prev, agent]);
    addLog(`Agent "${agent.name}" created → ${agent.did.slice(0, 20)}…`);
    if (agent.prompt) addLog(`Prompt loaded (${agent.prompt.length} chars)`);
    setNewAgent({ name: "", role: "researcher", prompt: "", templateIdx: 0 }); setShowCreate(false);
  };
  const updateAgentPrompt = (id) => {
    setAgents((prev) => prev.map((a) => a.id === id ? { ...a, prompt: editPromptText.trim() } : a));
    addLog(`Prompt updated for "${agents.find((a) => a.id === id)?.name}"`);
    setEditingPrompt(null); setEditPromptText("");
  };
  const removeAgent = (id) => {
    const agent = agents.find((a) => a.id === id);
    setAgents((prev) => prev.filter((a) => a.id !== id));
    setChannels((prev) => prev.filter((c) => c.from !== id && c.to !== id));
    setGroups((prev) => prev.map((g) => ({ ...g, members: g.members.filter((m) => m !== id) })));
    if (selectedAgent === id) setSelectedAgent(null);
    addLog(`Agent "${agent?.name}" revoked`);
  };
  const createChannel = () => {
    if (!channelForm.from || !channelForm.to || channelForm.from === channelForm.to) return;
    const exists = channels.some((c) => (c.from === channelForm.from && c.to === channelForm.to) || (c.from === channelForm.to && c.to === channelForm.from));
    if (exists) { addLog("Channel already exists"); return; }
    const ch = { id: crypto.randomUUID(), from: channelForm.from, to: channelForm.to, type: channelForm.type, offset: Math.random() * 120, createdAt: new Date().toISOString() };
    setChannels((prev) => [...prev, ch]);
    addLog(`P2P channel: ${agents.find(a => a.id === channelForm.from)?.name} ⟷ ${agents.find(a => a.id === channelForm.to)?.name}`);
    setChannelForm({ from: "", to: "", type: "data" });
  };
  const removeChannel = (id) => { setChannels((prev) => prev.filter((c) => c.id !== id)); if (activeChannel === id) setActiveChannel(null); addLog(`Channel dissolved`); };
  const createGroup = () => {
    if (!groupForm.name.trim() || groupForm.members.length < 2) return;
    const group = { id: crypto.randomUUID(), name: groupForm.name.trim(), governance: groupForm.governance, members: [...groupForm.members], threshold: groupForm.threshold, did: generateGroupDID(), color: GROUP_COLORS[groups.length % GROUP_COLORS.length], createdAt: new Date().toISOString() };
    setGroups((prev) => [...prev, group]); addLog(`Group "${group.name}" formed`);
    const newCh = [];
    for (let i = 0; i < group.members.length; i++) { for (let j = i + 1; j < group.members.length; j++) {
      const exists = channels.some((c) => (c.from === group.members[i] && c.to === group.members[j]) || (c.from === group.members[j] && c.to === group.members[i]));
      if (!exists) newCh.push({ id: crypto.randomUUID(), from: group.members[i], to: group.members[j], type: "consensus", offset: Math.random() * 120, createdAt: new Date().toISOString() });
    }}
    if (newCh.length) { setChannels((prev) => [...prev, ...newCh]); addLog(`Auto-established ${newCh.length} consensus channels`); }
    setGroupForm({ name: "", governance: "majority", members: [], threshold: 2 }); setShowGroupCreate(false);
  };
  const removeGroup = (id) => { setGroups((prev) => prev.filter((g) => g.id !== id)); if (selectedGroup === id) setSelectedGroup(null); addLog(`Group dissolved`); };
  const toggleGroupMember = (agentId) => { setGroupForm((prev) => ({ ...prev, members: prev.members.includes(agentId) ? prev.members.filter((m) => m !== agentId) : [...prev.members, agentId] })); };

  // ─── Message Passing ───
  const channelMessages = activeChannel ? messages.filter((m) => m.channelId === activeChannel) : [];
  const sendMessage = async () => {
    if (!msgInput.trim() || !activeChannel || sending) return;
    const ch = channels.find((c) => c.id === activeChannel); if (!ch) return;
    const fromAgent = agents.find((a) => a.id === ch.from); const toAgent = agents.find((a) => a.id === ch.to);
    if (!fromAgent || !toAgent) return;
    const msgId = crypto.randomUUID();
    const msg = { id: msgId, channelId: activeChannel, fromId: ch.from, toId: ch.to, content: msgInput.trim(), response: null, status: "sending", ts: Date.now() };
    setMessages((prev) => [...prev, msg]); setMsgInput(""); setSending(true);
    setActiveChannels((prev) => new Set([...prev, activeChannel]));
    addLog(`${fromAgent.name} → ${toAgent.name}: message sent`);
    if (toAgent.prompt) {
      const history = messages.filter((m) => m.channelId === activeChannel);
      const response = await callAgentAI(toAgent, fromAgent, msg.content, ch.type, history);
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response, status: "delivered" } : m));
      addLog(`${toAgent.name} responded (${response.length} chars)`);
    } else {
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response: "[Agent has no prompt]", status: "no-prompt" } : m));
    }
    setSending(false);
    setTimeout(() => setActiveChannels((prev) => { const n = new Set(prev); n.delete(activeChannel); return n; }), 3000);
  };
  const sendBroadcast = async () => {
    if (!broadcastInput.trim() || !broadcastGroup || broadcasting) return;
    const group = groups.find((g) => g.id === broadcastGroup); if (!group || group.members.length < 2) return;
    setBroadcasting(true); const senderId = group.members[0]; const sender = agents.find((a) => a.id === senderId);
    addLog(`Broadcasting to "${group.name}"...`);
    for (let i = 1; i < group.members.length; i++) {
      const receiverId = group.members[i]; const receiver = agents.find((a) => a.id === receiverId);
      const ch = channels.find((c) => (c.from === senderId && c.to === receiverId) || (c.from === receiverId && c.to === senderId));
      if (!ch || !receiver) continue;
      const msgId = crypto.randomUUID();
      const msg = { id: msgId, channelId: ch.id, fromId: senderId, toId: receiverId, content: `[GROUP BROADCAST — ${group.name}] ${broadcastInput.trim()}`, response: null, status: "sending", ts: Date.now() };
      setMessages((prev) => [...prev, msg]); setActiveChannels((prev) => new Set([...prev, ch.id]));
      if (receiver.prompt) {
        const response = await callAgentAI(receiver, sender, msg.content, ch.type, []);
        setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response, status: "delivered" } : m));
        addLog(`${receiver.name} responded to broadcast`);
      } else { setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, response: "[No prompt]", status: "no-prompt" } : m)); }
      setTimeout(() => setActiveChannels((prev) => { const n = new Set(prev); n.delete(ch.id); return n; }), 3000);
    }
    setBroadcasting(false); setBroadcastInput(""); addLog(`Broadcast complete`);
  };

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, activeChannel, bridgeMessages, selectedBridge]);
  const acCh = channels.find((c) => c.id === activeChannel);
  const acFrom = acCh ? agents.find((a) => a.id === acCh.from) : null;
  const acTo = acCh ? agents.find((a) => a.id === acCh.to) : null;

  // Ecosystem computed
  const selBridge = bridges.find((b) => b.id === selectedBridge);
  const selBridgeFromNet = selBridge ? ecosystems.find((n) => n.id === selBridge.fromNetworkId) : null;
  const selBridgeToNet = selBridge ? ecosystems.find((n) => n.id === selBridge.toNetworkId) : null;
  const selBridgeFrom = selBridgeFromNet?.agents.find((a) => a.id === selBridge?.fromAgentId);
  const selBridgeTo = selBridgeToNet?.agents.find((a) => a.id === selBridge?.toAgentId);
  const bridgeFromNet = bridgeForm.fromNet ? ecosystems.find((n) => n.id === bridgeForm.fromNet) : null;
  const bridgeToNet = bridgeForm.toNet ? ecosystems.find((n) => n.id === bridgeForm.toNet) : null;

  return (
    <div style={{ fontFamily: "'DM Mono', 'JetBrains Mono', monospace", background: "#0a0a0f", color: "#e4e4e7", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{ padding: "16px 20px", borderBottom: "1px solid rgba(0,229,160,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,229,160,0.02)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #00e5a0 0%, #0a0a0f 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⬡</div>
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>MESH WORKSPACE</div>
            <div style={{ fontSize: 10, color: "#71717a", letterSpacing: "0.05em" }}>DECENTRALIZED AGENT COLLABORATION</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, fontSize: 10, color: "#52525b", flexWrap: "wrap" }}>
          <span style={{ color: "#00e5a0" }}>●</span> {agents.length} agents
          <span style={{ margin: "0 4px" }}>|</span>
          <span style={{ color: "#a78bfa" }}>●</span> {channels.length} channels
          <span style={{ margin: "0 4px" }}>|</span>
          <span style={{ color: "#f472b6" }}>●</span> {groups.length} groups
          <span style={{ margin: "0 4px" }}>|</span>
          <span style={{ color: "#fbbf24" }}>●</span> {messages.length} msgs
          {ecosystems.length > 0 && <><span style={{ margin: "0 4px" }}>|</span><span style={{ color: "#38bdf8" }}>●</span> {ecosystems.length} nets</>}
          {bridges.length > 0 && <><span style={{ margin: "0 4px" }}>|</span><span style={{ color: "#fb923c" }}>●</span> {bridges.length} bridges</>}
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <nav style={{ width: 200, borderRight: "1px solid rgba(0,229,160,0.08)", padding: "12px 0", display: "flex", flexDirection: "column", gap: 2, background: "rgba(0,0,0,0.3)", flexShrink: 0 }}>
          {[
            { id: "architect", label: "Architect", icon: "✦", accent: "#fbbf24" },
            { id: "ecosystem", label: "Ecosystem", icon: "◎", accent: "#38bdf8" },
            { id: "agents", label: "Agents", icon: "◉", accent: "#00e5a0" },
            { id: "channels", label: "Channels", icon: "⟷", accent: "#a78bfa" },
            { id: "groups", label: "Groups", icon: "⬡", accent: "#f472b6" },
            { id: "messages", label: "Messages", icon: "◆", accent: "#fbbf24" },
            { id: "network", label: "Topology", icon: "◈", accent: "#00e5a0" },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setView(tab.id)} style={{
              background: view === tab.id ? tab.accent + "10" : "transparent",
              border: "none", color: view === tab.id ? tab.accent : "#71717a",
              padding: "10px 16px", textAlign: "left", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, display: "flex", alignItems: "center", gap: 8,
              borderLeft: view === tab.id ? `2px solid ${tab.accent}` : "2px solid transparent", transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 14 }}>{tab.icon}</span> {tab.label}
              {tab.id === "ecosystem" && ecosystems.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 9, background: "rgba(56,189,248,0.15)", color: "#38bdf8", padding: "1px 6px", borderRadius: 8 }}>{ecosystems.length}</span>
              )}
              {tab.id === "messages" && messages.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 9, background: "rgba(251,191,36,0.15)", color: "#fbbf24", padding: "1px 6px", borderRadius: 8 }}>{messages.length}</span>
              )}
            </button>
          ))}
          <div style={{ marginTop: "auto", padding: "12px 14px", borderTop: "1px solid rgba(0,229,160,0.06)" }}>
            <div style={{ fontSize: 9, color: "#52525b", letterSpacing: "0.1em", marginBottom: 8 }}>ACTIVITY LOG</div>
            <div style={{ maxHeight: 200, overflow: "auto" }}>
              {log.length === 0 && <div style={{ fontSize: 10, color: "#3f3f46" }}>No activity yet</div>}
              {log.map((l, i) => (
                <div key={l.ts + "-" + i} style={{ fontSize: 9, color: "#71717a", marginBottom: 6, lineHeight: 1.4 }}>
                  <span style={{ color: "#00e5a0", opacity: 0.5 }}>▸</span> {l.msg}
                </div>
              ))}
            </div>
          </div>
        </nav>

        {/* Main */}
        <main style={{ flex: 1, padding: 24, overflow: "auto" }}>

          {/* ═══ ARCHITECT ═══ */}
          {view === "architect" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>
                  <span style={{ color: "#fbbf24" }}>✦</span> Workspace Architect
                </h2>
                {(archPhase === "preview" || archPhase === "done") && (
                  <button onClick={resetArchitect} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a", padding: "6px 14px", borderRadius: 6, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>
                    New Design
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#71717a", marginBottom: 24, lineHeight: 1.6 }}>
                Describe a network and the AI architect will generate agents, channels, groups, and example conversations.
              </div>

              {/* ── Input Phase ── */}
              {archPhase === "input" && (
                <>
                  {sectionTitle("Quick Scenarios")}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 24 }}>
                    {SCENARIO_PRESETS.map((s) => (
                      <button key={s.id} onClick={() => { setArchPrompt(s.desc); }} style={{
                        background: archPrompt === s.desc ? s.color + "10" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${archPrompt === s.desc ? s.color + "35" : "rgba(255,255,255,0.05)"}`,
                        borderRadius: 10, padding: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s",
                      }}>
                        <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: archPrompt === s.desc ? s.color : "#d4d4d8", marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 9, color: "#52525b", lineHeight: 1.5 }}>{s.desc}</div>
                      </button>
                    ))}
                  </div>

                  {sectionTitle("Or describe your own network")}
                  <textarea
                    placeholder="Describe the mesh network you want to build. Be specific about agent roles, how they should collaborate, what kind of decisions need group governance, and what problems they're solving together..."
                    value={archPrompt}
                    onChange={(e) => setArchPrompt(e.target.value)}
                    rows={5}
                    style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)", lineHeight: 1.6, marginBottom: 16 }}
                  />

                  {archError && (
                    <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#ef4444", marginBottom: 16 }}>
                      {archError}
                    </div>
                  )}

                  <button
                    onClick={() => archPrompt.trim() && generateNetwork(archPrompt.trim())}
                    disabled={archGenerating || !archPrompt.trim()}
                    style={{
                      background: archGenerating ? "rgba(251,191,36,0.15)" : archPrompt.trim() ? "#fbbf24" : "#3f3f46",
                      color: archGenerating ? "#fbbf24" : "#0a0a0f",
                      border: archGenerating ? "1px solid rgba(251,191,36,0.3)" : "none",
                      padding: "12px 28px", borderRadius: 8, cursor: archGenerating || !archPrompt.trim() ? "not-allowed" : "pointer",
                      fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                      display: "flex", alignItems: "center", gap: 8,
                    }}
                  >
                    {archGenerating && <span style={{ animation: "pulse 1.5s infinite" }}>✦</span>}
                    {archGenerating ? "Architecting mesh network…" : "✦ Generate Network"}
                  </button>
                </>
              )}

              {/* ── Preview Phase ── */}
              {archPhase === "preview" && archPreview && (
                <div>
                  <div style={{ background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.12)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#fbbf24" }}>✦ Network Blueprint</div>
                      <div style={{ fontSize: 10, color: "#52525b" }}>
                        {archPreview.agents.length} agents · {archPreview.channels.length} channels · {archPreview.groups?.length || 0} groups · {archPreview.exampleMessages?.length || 0} messages
                      </div>
                    </div>

                    {sectionTitle("Agents")}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: 20 }}>
                      {archPreview.agents.map((a, i) => {
                        const role = ROLES.find(r => r.id === a.role) || ROLES[0];
                        return (
                          <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${role.color}20`, borderRadius: 8, padding: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 14 }}>{role.icon}</span>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 500 }}>{a.name}</div>
                                <div style={{ fontSize: 9, color: role.color }}>{role.label}</div>
                              </div>
                            </div>
                            <div style={{ fontSize: 9, color: "#a1a1aa", lineHeight: 1.5, maxHeight: 54, overflow: "hidden" }}>{a.prompt}</div>
                          </div>
                        );
                      })}
                    </div>

                    {sectionTitle("Channels")}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                      {archPreview.channels.map((c, i) => {
                        const from = archPreview.agents[c.from]; const to = archPreview.agents[c.to];
                        const cType = CHANNEL_TYPES.find(t => t.id === c.type) || CHANNEL_TYPES[0];
                        if (!from || !to) return null;
                        return (
                          <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 6, padding: "8px 12px", fontSize: 10 }}>
                            <span style={{ color: "#d4d4d8" }}>{from.name}</span>
                            <span style={{ color: "#52525b", margin: "0 6px" }}>⟷</span>
                            <span style={{ color: "#d4d4d8" }}>{to.name}</span>
                            <span style={{ color: "#a78bfa", marginLeft: 8 }}>{cType.icon} {cType.label}</span>
                          </div>
                        );
                      })}
                    </div>

                    {archPreview.groups && archPreview.groups.length > 0 && (
                      <>
                        {sectionTitle("Groups")}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                          {archPreview.groups.map((g, i) => {
                            const gov = GOVERNANCE_MODELS.find(m => m.id === g.governance) || GOVERNANCE_MODELS[0];
                            return (
                              <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(244,114,182,0.15)", borderRadius: 8, padding: 12, minWidth: 200 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, color: "#f472b6", marginBottom: 4 }}>⬡ {g.name}</div>
                                <div style={{ fontSize: 9, color: "#71717a", marginBottom: 6 }}>{gov.icon} {gov.label}</div>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {g.members.map((idx) => {
                                    const a = archPreview.agents[idx]; if (!a) return null;
                                    return <span key={idx} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: "#a1a1aa" }}>{a.name}</span>;
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {archPreview.exampleMessages && archPreview.exampleMessages.length > 0 && (
                      <>
                        {sectionTitle("Example Messages (will trigger AI responses)")}
                        {archPreview.exampleMessages.map((em, i) => {
                          const ch = archPreview.channels[em.channelIdx];
                          const from = ch ? archPreview.agents[ch.from] : null;
                          const to = ch ? archPreview.agents[ch.to] : null;
                          if (!from || !to) return null;
                          return (
                            <div key={i} style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 6, padding: "10px 12px", marginBottom: 8 }}>
                              <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4 }}>{from.name} → {to.name}</div>
                              <div style={{ fontSize: 11, color: "#d4d4d8", lineHeight: 1.5 }}>{em.message}</div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 12 }}>
                    <button onClick={deployNetwork} style={{
                      background: "#fbbf24", color: "#0a0a0f", border: "none",
                      padding: "12px 28px", borderRadius: 8, cursor: "pointer",
                      fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                    }}>⬡ Deploy Network</button>
                    <button onClick={resetArchitect} style={{
                      background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
                      color: "#71717a", padding: "12px 20px", borderRadius: 8, cursor: "pointer",
                      fontFamily: "inherit", fontSize: 12,
                    }}>Discard</button>
                  </div>
                </div>
              )}

              {/* ── Deploying Phase ── */}
              {archPhase === "deploying" && (
                <div style={{ textAlign: "center", padding: "60px 0" }}>
                  <div style={{ fontSize: 40, marginBottom: 16, animation: "pulse 1.5s infinite" }}>⬡</div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: "#fbbf24", marginBottom: 8 }}>Deploying Mesh Network</div>
                  <div style={{ fontSize: 11, color: "#71717a", marginBottom: 20 }}>{deployProgress.step}</div>
                  <div style={{ maxWidth: 300, margin: "0 auto", background: "rgba(255,255,255,0.04)", borderRadius: 6, height: 6, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", background: "#fbbf24", borderRadius: 6,
                      width: `${deployProgress.total > 0 ? (deployProgress.count / deployProgress.total) * 100 : 0}%`,
                      transition: "width 0.3s",
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#52525b", marginTop: 8 }}>{deployProgress.count} / {deployProgress.total}</div>
                </div>
              )}

              {/* ── Done Phase ── */}
              {archPhase === "done" && (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: "#00e5a0", marginBottom: 8 }}>Network Deployed</div>
                  <div style={{ fontSize: 11, color: "#71717a", marginBottom: 24 }}>
                    {agents.length} agents · {channels.length} channels · {groups.length} groups · {messages.length} messages
                  </div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                    <button onClick={() => setView("network")} style={{ background: "rgba(0,229,160,0.12)", border: "1px solid rgba(0,229,160,0.25)", color: "#00e5a0", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>◈ View Network</button>
                    <button onClick={() => setView("ecosystem")} style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.25)", color: "#38bdf8", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>◎ Save to Ecosystem</button>
                    <button onClick={() => setView("agents")} style={{ background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.15)", color: "#00e5a0", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>◉ Browse Agents</button>
                    <button onClick={resetArchitect} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>✦ Build Another</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ ECOSYSTEM ═══ */}
          {view === "ecosystem" && (
            <div>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                <span style={{ color: "#38bdf8" }}>◎</span> Ecosystem
              </h2>
              <div style={{ fontSize: 11, color: "#71717a", marginBottom: 24, lineHeight: 1.6 }}>
                Save networks as independent entities. Bridge agents across networks for cross-mesh communication.
              </div>

              {/* Save Current Workspace */}
              {agents.length > 0 && (
                <div style={{ background: "rgba(56,189,248,0.04)", border: "1px solid rgba(56,189,248,0.12)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
                  {sectionTitle("Save Current Workspace as Network")}
                  <div style={{ display: "flex", gap: 10 }}>
                    <input placeholder="Network name..." value={ecoSaveName} onChange={(e) => setEcoSaveName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveCurrentNetwork()} style={{ ...inputStyle, border: "1px solid rgba(56,189,248,0.2)" }} />
                    <button onClick={saveCurrentNetwork} disabled={!ecoSaveName.trim()} style={{ background: ecoSaveName.trim() ? "#38bdf8" : "#3f3f46", color: "#0a0a0f", border: "none", padding: "10px 20px", borderRadius: 6, cursor: ecoSaveName.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>Save</button>
                    <button onClick={clearWorkspace} style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "#71717a", padding: "10px 14px", borderRadius: 6, fontFamily: "inherit", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>Clear Workspace</button>
                  </div>
                  <div style={{ fontSize: 9, color: "#52525b", marginTop: 8 }}>Snapshots {agents.length} agents, {channels.length} channels, {groups.length} groups</div>
                </div>
              )}

              {/* Saved Networks Grid */}
              {ecosystems.length > 0 && (
                <>
                  {sectionTitle("Networks")}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginBottom: 24 }}>
                    {ecosystems.map((net) => (
                      <div key={net.id} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${net.color}25`, borderRadius: 10, padding: 16, transition: "all 0.2s" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div>
                            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 14, color: net.color }}>◎ {net.name}</div>
                            <div style={{ fontSize: 9, color: "#52525b", marginTop: 2 }}>{net.agents.length} agents · {net.channels.length} ch · {net.groups.length} groups</div>
                          </div>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: net.color, boxShadow: `0 0 8px ${net.color}` }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#71717a", marginBottom: 8, wordBreak: "break-all" }}>{net.did}</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
                          {net.agents.slice(0, 6).map((a) => {
                            const r = ROLES.find((x) => x.id === a.role);
                            return <span key={a.id} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: (r?.color || "#555") + "12", color: r?.color || "#555" }}>{r?.icon} {a.name}</span>;
                          })}
                          {net.agents.length > 6 && <span style={{ fontSize: 9, padding: "2px 6px", color: "#52525b" }}>+{net.agents.length - 6}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => loadNetwork(net.id)} style={{ background: net.color + "12", border: `1px solid ${net.color}30`, color: net.color, padding: "5px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Load into Workspace</button>
                          <button onClick={() => dissolveNetwork(net.id)} style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", color: "#ef4444", padding: "5px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Dissolve</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Bridge Builder */}
              {ecosystems.length >= 2 && (
                <div style={{ background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.12)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
                  {sectionTitle("Create Cross-Network Bridge")}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4 }}>SOURCE NETWORK</div>
                      <select value={bridgeForm.fromNet} onChange={(e) => setBridgeForm({ ...bridgeForm, fromNet: e.target.value, fromAgent: "" })} style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)" }}>
                        <option value="">Select network…</option>
                        {ecosystems.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.agents.length} agents)</option>)}
                      </select>
                      {bridgeFromNet && (
                        <select value={bridgeForm.fromAgent} onChange={(e) => setBridgeForm({ ...bridgeForm, fromAgent: e.target.value })} style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.1)", marginTop: 6 }}>
                          <option value="">Select agent…</option>
                          {bridgeFromNet.agents.map((a) => <option key={a.id} value={a.id}>{ROLES.find((r) => r.id === a.role)?.icon} {a.name}</option>)}
                        </select>
                      )}
                    </div>
                    <div style={{ color: "#fbbf24", fontSize: 18, alignSelf: "center", flexShrink: 0, padding: "12px 0" }}>⟷</div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4 }}>TARGET NETWORK</div>
                      <select value={bridgeForm.toNet} onChange={(e) => setBridgeForm({ ...bridgeForm, toNet: e.target.value, toAgent: "" })} style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)" }}>
                        <option value="">Select network…</option>
                        {ecosystems.filter((n) => n.id !== bridgeForm.fromNet).map((n) => <option key={n.id} value={n.id}>{n.name} ({n.agents.length} agents)</option>)}
                      </select>
                      {bridgeToNet && (
                        <select value={bridgeForm.toAgent} onChange={(e) => setBridgeForm({ ...bridgeForm, toAgent: e.target.value })} style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.1)", marginTop: 6 }}>
                          <option value="">Select agent…</option>
                          {bridgeToNet.agents.map((a) => <option key={a.id} value={a.id}>{ROLES.find((r) => r.id === a.role)?.icon} {a.name}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 4 }}>{CHANNEL_TYPES.map((t) => pillBtn(bridgeForm.type === t.id, "#fbbf24", () => setBridgeForm({ ...bridgeForm, type: t.id }), `${t.icon} ${t.label}`))}</div>
                    <button onClick={createBridge} disabled={!bridgeForm.fromAgent || !bridgeForm.toAgent} style={{ background: bridgeForm.fromAgent && bridgeForm.toAgent ? "#fbbf24" : "#3f3f46", color: "#0a0a0f", border: "none", padding: "10px 18px", borderRadius: 6, cursor: bridgeForm.fromAgent && bridgeForm.toAgent ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 11, fontWeight: 500 }}>Create Bridge</button>
                  </div>
                </div>
              )}

              {/* Bridges + Messaging */}
              {bridges.length > 0 && (
                <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
                  {/* Bridge list */}
                  <div style={{ width: 260, flexShrink: 0 }}>
                    {sectionTitle("Active Bridges")}
                    {bridges.map((b) => {
                      const fNet = ecosystems.find((n) => n.id === b.fromNetworkId);
                      const tNet = ecosystems.find((n) => n.id === b.toNetworkId);
                      const fA = fNet?.agents.find((a) => a.id === b.fromAgentId);
                      const tA = tNet?.agents.find((a) => a.id === b.toAgentId);
                      const bmCount = bridgeMessages.filter((m) => m.bridgeId === b.id).length;
                      const isSel = selectedBridge === b.id;
                      return (
                        <div key={b.id} onClick={() => setSelectedBridge(isSel ? null : b.id)} style={{ background: isSel ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${isSel ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.05)"}`, borderRadius: 8, padding: 12, marginBottom: 8, cursor: "pointer", transition: "all 0.15s" }}>
                          <div style={{ fontSize: 11, color: isSel ? "#fbbf24" : "#a1a1aa", marginBottom: 4 }}>
                            {fA?.name || "?"} <span style={{ color: "#fbbf24" }}>⟷</span> {tA?.name || "?"}
                          </div>
                          <div style={{ fontSize: 9, color: "#52525b" }}>
                            {fNet?.name} → {tNet?.name}
                            {bmCount > 0 && <span style={{ color: "#fbbf24", marginLeft: 6 }}>{bmCount} msgs</span>}
                          </div>
                          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                            <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(251,191,36,0.08)", color: "#fbbf24" }}>{CHANNEL_TYPES.find((t) => t.id === b.type)?.label || "Data"}</span>
                            <button onClick={(e) => { e.stopPropagation(); removeBridge(b.id); }} style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.15)", color: "#71717a", padding: "2px 8px", borderRadius: 3, fontFamily: "inherit", fontSize: 9, cursor: "pointer", marginLeft: "auto" }}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bridge message thread */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.2)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden", maxHeight: 500 }}>
                    {selectedBridge && selBridgeFrom && selBridgeTo ? (
                      <>
                        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>
                            <span style={{ color: ROLES.find((r) => r.id === selBridgeFrom.role)?.color }}>{selBridgeFrom.name}</span>
                            <span style={{ color: "#fbbf24", margin: "0 8px" }}>⟷</span>
                            <span style={{ color: ROLES.find((r) => r.id === selBridgeTo.role)?.color }}>{selBridgeTo.name}</span>
                          </div>
                          <div style={{ fontSize: 9, color: "#52525b", marginTop: 3 }}>
                            Cross-network bridge · {selBridgeFromNet?.name} → {selBridgeToNet?.name}
                          </div>
                        </div>
                        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
                          {bridgeMessages.filter((m) => m.bridgeId === selectedBridge).length === 0 && (
                            <div style={{ textAlign: "center", padding: 30, color: "#3f3f46", fontSize: 11 }}>Send a message across the bridge.</div>
                          )}
                          {bridgeMessages.filter((m) => m.bridgeId === selectedBridge).map((m) => {
                            const sRole = ROLES.find((r) => r.id === selBridgeFrom.role);
                            const rRole = ROLES.find((r) => r.id === selBridgeTo.role);
                            return (
                              <div key={m.id} style={{ marginBottom: 16 }}>
                                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                                  <div style={{ width: 26, height: 26, borderRadius: 6, background: (sRole?.color || "#555") + "20", border: `1px solid ${sRole?.color || "#555"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{sRole?.icon}</div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 9, color: sRole?.color, marginBottom: 3 }}>{selBridgeFrom.name} <span style={{ color: "#3f3f46", fontSize: 8 }}>({selBridgeFromNet?.name})</span></div>
                                    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "2px 10px 10px 10px", padding: "10px 14px", fontSize: 11, lineHeight: 1.6, color: "#d4d4d8" }}>{m.content}</div>
                                  </div>
                                </div>
                                {m.status === "sending" && (
                                  <div style={{ paddingLeft: 34, fontSize: 10, color: "#fbbf24" }}><span style={{ animation: "pulse 1.5s infinite" }}>●</span> {selBridgeTo.name} is thinking across networks…</div>
                                )}
                                {m.response && (
                                  <div style={{ display: "flex", gap: 8, paddingLeft: 34 }}>
                                    <div style={{ width: 26, height: 26, borderRadius: 6, background: (rRole?.color || "#555") + "20", border: `1px solid ${rRole?.color || "#555"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{rRole?.icon}</div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 9, color: rRole?.color, marginBottom: 3 }}>{selBridgeTo.name} <span style={{ color: "#3f3f46", fontSize: 8 }}>({selBridgeToNet?.name})</span> <span style={{ color: m.status === "no-prompt" ? "#ef4444" : "#3f3f46", fontSize: 8 }}>{m.status === "no-prompt" ? "no prompt" : "response"}</span></div>
                                      <div style={{ background: m.status === "no-prompt" ? "rgba(239,68,68,0.05)" : (rRole?.color || "#555") + "08", border: `1px solid ${m.status === "no-prompt" ? "rgba(239,68,68,0.15)" : (rRole?.color || "#555") + "15"}`, borderRadius: "10px 2px 10px 10px", padding: "10px 14px", fontSize: 11, lineHeight: 1.6, color: m.status === "no-prompt" ? "#71717a" : "#d4d4d8", whiteSpace: "pre-wrap" }}>{m.response}</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <div ref={msgEndRef} />
                        </div>
                        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input placeholder={`Message ${selBridgeTo.name} across bridge...`} value={bridgeMsgInput} onChange={(e) => setBridgeMsgInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendBridgeMessage()} disabled={bridgeSending} style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)", opacity: bridgeSending ? 0.5 : 1 }} />
                            <button onClick={sendBridgeMessage} disabled={bridgeSending || !bridgeMsgInput.trim()} style={{ background: bridgeSending ? "#3f3f46" : "#fbbf24", color: "#0a0a0f", border: "none", padding: "10px 16px", borderRadius: 6, cursor: bridgeSending ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{bridgeSending ? "…" : "Send"}</button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#3f3f46" }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 28, marginBottom: 8 }}>⟷</div>
                          <div style={{ fontSize: 11 }}>Select a bridge to send cross-network messages.</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Ecosystem Topology Canvas */}
              {ecosystems.length >= 2 && (
                <>
                  {sectionTitle("Ecosystem Topology")}
                  <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(56,189,248,0.08)", borderRadius: 12, height: 350, overflow: "hidden" }}>
                    <EcosystemCanvas networks={ecosystems} bridges={bridges} activeBridges={activeBridges} />
                  </div>
                </>
              )}

              {/* Empty state */}
              {ecosystems.length === 0 && agents.length === 0 && (
                <div style={{ textAlign: "center", padding: 60, color: "#3f3f46", border: "1px dashed rgba(56,189,248,0.1)", borderRadius: 12 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
                  <div style={{ fontSize: 12, marginBottom: 16 }}>Build networks with the Architect, then save them here to form an ecosystem.</div>
                  <button onClick={() => setView("architect")} style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>✦ Open Architect</button>
                </div>
              )}
            </div>
          )}

          {/* ═══ AGENTS ═══ */}
          {view === "agents" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>Agent Registry</h2>
                <button onClick={() => setShowCreate(!showCreate)} style={{ background: showCreate ? "rgba(239,68,68,0.15)" : "rgba(0,229,160,0.12)", color: showCreate ? "#ef4444" : "#00e5a0", border: `1px solid ${showCreate ? "rgba(239,68,68,0.3)" : "rgba(0,229,160,0.25)"}`, padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>{showCreate ? "✕ Cancel" : "+ Create Agent"}</button>
              </div>
              {showCreate && (
                <div style={{ background: "rgba(0,229,160,0.04)", border: "1px solid rgba(0,229,160,0.12)", borderRadius: 10, padding: 20, marginBottom: 20 }}>
                  {sectionTitle("Identity & Role")}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                    <input placeholder="Agent name" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 160, border: "1px solid rgba(0,229,160,0.15)" }} />
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{ROLES.map((r) => pillBtn(newAgent.role === r.id, r.color, () => setNewAgent({ ...newAgent, role: r.id }), `${r.icon} ${r.label}`))}</div>
                  </div>
                  {sectionTitle("Agent Prompt")}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {PROMPT_TEMPLATES.map((t, idx) => (<button key={t.label} onClick={() => setNewAgent({ ...newAgent, prompt: t.prompt, templateIdx: idx })} style={{ background: newAgent.templateIdx === idx ? "rgba(0,229,160,0.12)" : "rgba(0,0,0,0.3)", border: `1px solid ${newAgent.templateIdx === idx ? "rgba(0,229,160,0.3)" : "rgba(255,255,255,0.06)"}`, color: newAgent.templateIdx === idx ? "#00e5a0" : "#71717a", padding: "5px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 10 }}>{t.label}</button>))}
                  </div>
                  <textarea placeholder="Define behavior..." value={newAgent.prompt} onChange={(e) => setNewAgent({ ...newAgent, prompt: e.target.value, templateIdx: 0 })} rows={4} style={{ ...inputStyle, border: "1px solid rgba(0,229,160,0.15)", lineHeight: 1.6 }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                    <span style={{ fontSize: 10, color: "#52525b" }}>{newAgent.prompt.length > 0 ? `${newAgent.prompt.length} chars` : "No prompt"}</span>
                    <button onClick={createAgent} style={{ background: "#00e5a0", color: "#0a0a0f", border: "none", padding: "10px 20px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 500 }}>Generate Identity</button>
                  </div>
                </div>
              )}
              {agents.length === 0 && !showCreate && <div style={{ textAlign: "center", padding: 60, color: "#3f3f46", border: "1px dashed rgba(0,229,160,0.1)", borderRadius: 12 }}><div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div><div style={{ fontSize: 12 }}>No agents yet. Use the Architect or create manually.</div></div>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                {agents.map((a) => {
                  const role = ROLES.find((r) => r.id === a.role); const agentChannels = channels.filter((c) => c.from === a.id || c.to === a.id);
                  const agentGroups = groups.filter((g) => g.members.includes(a.id)); const agentMsgs = messages.filter((m) => m.fromId === a.id || m.toId === a.id);
                  const isSelected = selectedAgent === a.id; const isEditing = editingPrompt === a.id;
                  return (
                    <div key={a.id} onClick={() => { if (!isEditing) setSelectedAgent(isSelected ? null : a.id); }} style={{ background: isSelected ? "rgba(0,229,160,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${isSelected ? role.color + "40" : "rgba(255,255,255,0.05)"}`, borderRadius: 10, padding: 16, cursor: isEditing ? "default" : "pointer", transition: "all 0.2s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: role.color + "15", border: `1px solid ${role.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{role.icon}</div>
                          <div><div style={{ fontWeight: 500, fontSize: 13 }}>{a.name}</div><div style={{ fontSize: 10, color: role.color }}>{role.label}</div></div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {a.prompt && <span style={{ fontSize: 9, color: "#52525b", background: "rgba(0,229,160,0.08)", padding: "2px 6px", borderRadius: 3 }}>PROMPTED</span>}
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00e5a0", boxShadow: "0 0 8px #00e5a0" }} />
                        </div>
                      </div>
                      {a.prompt && !isEditing && <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 6, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,229,160,0.08)", fontSize: 10, color: "#a1a1aa", lineHeight: 1.5, maxHeight: isSelected ? "none" : 42, overflow: "hidden" }}><span style={{ color: "#52525b", fontSize: 9, letterSpacing: "0.05em" }}>PROMPT </span>{a.prompt}</div>}
                      {isEditing && <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}><textarea value={editPromptText} onChange={(e) => setEditPromptText(e.target.value)} rows={5} style={{ ...inputStyle, border: "1px solid rgba(0,229,160,0.2)", lineHeight: 1.5 }} autoFocus /><div style={{ display: "flex", gap: 6, marginTop: 8 }}><button onClick={() => updateAgentPrompt(a.id)} style={{ background: "rgba(0,229,160,0.15)", border: "1px solid rgba(0,229,160,0.3)", color: "#00e5a0", padding: "6px 14px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Save</button><button onClick={() => setEditingPrompt(null)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a", padding: "6px 14px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Cancel</button></div></div>}
                      <div style={{ marginTop: 12, fontSize: 10 }}><div style={{ color: "#52525b", marginBottom: 4, letterSpacing: "0.05em" }}>DID</div><div style={{ color: "#a1a1aa", fontFamily: "'DM Mono', monospace", wordBreak: "break-all" }}>{a.did}</div></div>
                      <div style={{ marginTop: 10, display: "flex", gap: 12, fontSize: 10, flexWrap: "wrap" }}>
                        <div><span style={{ color: "#52525b" }}>CH </span><span style={{ color: "#71717a" }}>{agentChannels.length}</span></div>
                        <div><span style={{ color: "#52525b" }}>GROUPS </span><span style={{ color: "#71717a" }}>{agentGroups.length}</span></div>
                        <div><span style={{ color: "#52525b" }}>MSGS </span><span style={{ color: "#71717a" }}>{agentMsgs.length}</span></div>
                      </div>
                      {agentGroups.length > 0 && <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>{agentGroups.map((g) => (<span key={g.id} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: g.color + "15", color: g.color, border: `1px solid ${g.color}30` }}>⬡ {g.name}</span>))}</div>}
                      {isSelected && !isEditing && <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8 }}><button onClick={(e) => { e.stopPropagation(); setEditingPrompt(a.id); setEditPromptText(a.prompt || ""); }} style={{ background: "rgba(0,229,160,0.1)", border: "1px solid rgba(0,229,160,0.2)", color: "#00e5a0", padding: "6px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>{a.prompt ? "Edit Prompt" : "Add Prompt"}</button><button onClick={(e) => { e.stopPropagation(); removeAgent(a.id); }} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", padding: "6px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Revoke</button></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ CHANNELS ═══ */}
          {view === "channels" && (
            <div>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, marginBottom: 20 }}>P2P Channels</h2>
              {agents.length < 2 ? <div style={{ textAlign: "center", padding: 40, color: "#3f3f46", border: "1px dashed rgba(167,139,250,0.15)", borderRadius: 12 }}><div style={{ fontSize: 12 }}>Need at least 2 agents.</div></div> : (
                <div style={{ background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.12)", borderRadius: 10, padding: 20, marginBottom: 20 }}>
                  {sectionTitle("Establish Channel")}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <select value={channelForm.from} onChange={(e) => setChannelForm({ ...channelForm, from: e.target.value })} style={{ ...inputStyle, width: "auto", minWidth: 140, border: "1px solid rgba(167,139,250,0.2)" }}><option value="">From…</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                    <span style={{ color: "#52525b" }}>⟷</span>
                    <select value={channelForm.to} onChange={(e) => setChannelForm({ ...channelForm, to: e.target.value })} style={{ ...inputStyle, width: "auto", minWidth: 140, border: "1px solid rgba(167,139,250,0.2)" }}><option value="">To…</option>{agents.filter((a) => a.id !== channelForm.from).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                    <div style={{ display: "flex", gap: 4 }}>{CHANNEL_TYPES.map((t) => pillBtn(channelForm.type === t.id, "#a78bfa", () => setChannelForm({ ...channelForm, type: t.id }), `${t.icon} ${t.label}`))}</div>
                    <button onClick={createChannel} style={{ background: "#a78bfa", color: "#0a0a0f", border: "none", padding: "10px 18px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500 }}>Connect</button>
                  </div>
                </div>
              )}
              {channels.map((ch) => { const from = agents.find((a) => a.id === ch.from); const to = agents.find((a) => a.id === ch.to); const cType = CHANNEL_TYPES.find((t) => t.id === ch.type); const msgCount = messages.filter((m) => m.channelId === ch.id).length; if (!from || !to) return null; return (
                <div key={ch.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}><span style={{ color: ROLES.find(r => r.id === from.role)?.color }}>{from.name}</span><span style={{ color: "#52525b" }}>⟷</span><span style={{ color: ROLES.find(r => r.id === to.role)?.color }}>{to.name}</span><span style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa", padding: "3px 8px", borderRadius: 4, fontSize: 10 }}>{cType?.icon} {cType?.label}</span>{msgCount > 0 && <span style={{ fontSize: 9, color: "#fbbf24", background: "rgba(251,191,36,0.1)", padding: "2px 6px", borderRadius: 4 }}>{msgCount} msgs</span>}</div>
                  <div style={{ display: "flex", gap: 6 }}><button onClick={() => { setActiveChannel(ch.id); setView("messages"); }} style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24", padding: "4px 10px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Message</button><button onClick={() => removeChannel(ch.id)} style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "#71717a", padding: "4px 10px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>✕</button></div>
                </div>); })}
            </div>
          )}

          {/* ═══ GROUPS ═══ */}
          {view === "groups" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>Group Governance</h2>
                <button onClick={() => setShowGroupCreate(!showGroupCreate)} style={{ background: showGroupCreate ? "rgba(239,68,68,0.15)" : "rgba(244,114,182,0.12)", color: showGroupCreate ? "#ef4444" : "#f472b6", border: `1px solid ${showGroupCreate ? "rgba(239,68,68,0.3)" : "rgba(244,114,182,0.25)"}`, padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>{showGroupCreate ? "✕ Cancel" : "+ Form Group"}</button>
              </div>
              {showGroupCreate && (
                <div style={{ background: "rgba(244,114,182,0.04)", border: "1px solid rgba(244,114,182,0.12)", borderRadius: 10, padding: 20, marginBottom: 20 }}>
                  {sectionTitle("Group Identity")}
                  <input placeholder="Group name" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} style={{ ...inputStyle, border: "1px solid rgba(244,114,182,0.15)", marginBottom: 16 }} />
                  {sectionTitle("Governance Model")}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, marginBottom: 16 }}>
                    {GOVERNANCE_MODELS.map((g) => (<button key={g.id} onClick={() => setGroupForm({ ...groupForm, governance: g.id })} style={{ background: groupForm.governance === g.id ? "rgba(244,114,182,0.1)" : "rgba(0,0,0,0.3)", border: `1px solid ${groupForm.governance === g.id ? "rgba(244,114,182,0.35)" : "rgba(255,255,255,0.06)"}`, color: groupForm.governance === g.id ? "#f472b6" : "#71717a", padding: "10px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}><div style={{ fontSize: 13, marginBottom: 4 }}>{g.icon} {g.label}</div><div style={{ fontSize: 9, color: "#52525b" }}>{g.desc}</div></button>))}
                  </div>
                  {groupForm.governance === "threshold" && <div style={{ marginBottom: 16 }}>{sectionTitle("Threshold (M-of-N)")}<div style={{ display: "flex", alignItems: "center", gap: 10 }}><input type="number" min={1} max={groupForm.members.length || 10} value={groupForm.threshold} onChange={(e) => setGroupForm({ ...groupForm, threshold: parseInt(e.target.value) || 2 })} style={{ ...inputStyle, width: 60, textAlign: "center", border: "1px solid rgba(244,114,182,0.15)" }} /><span style={{ fontSize: 11, color: "#71717a" }}>of {groupForm.members.length} required</span></div></div>}
                  {sectionTitle("Select Members")}
                  {agents.length === 0 ? <div style={{ fontSize: 11, color: "#3f3f46", padding: 16 }}>Create agents first.</div> : <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>{agents.map((a) => { const role = ROLES.find((r) => r.id === a.role); const selected = groupForm.members.includes(a.id); return (<button key={a.id} onClick={() => toggleGroupMember(a.id)} style={{ background: selected ? role.color + "15" : "rgba(0,0,0,0.3)", border: `1px solid ${selected ? role.color + "40" : "rgba(255,255,255,0.06)"}`, color: selected ? role.color : "#71717a", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>{selected ? "✓ " : ""}{role.icon} {a.name}</button>); })}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 10, color: "#52525b" }}>{groupForm.members.length} selected</span><button onClick={createGroup} disabled={groupForm.members.length < 2 || !groupForm.name.trim()} style={{ background: groupForm.members.length >= 2 && groupForm.name.trim() ? "#f472b6" : "#3f3f46", color: "#0a0a0f", border: "none", padding: "10px 20px", borderRadius: 6, cursor: groupForm.members.length >= 2 ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 12, fontWeight: 500 }}>Form Group</button></div>
                </div>
              )}
              {groups.length === 0 && !showGroupCreate && <div style={{ textAlign: "center", padding: 60, color: "#3f3f46", border: "1px dashed rgba(244,114,182,0.1)", borderRadius: 12 }}><div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div><div style={{ fontSize: 12 }}>No groups yet.</div></div>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                {groups.map((g) => { const gov = GOVERNANCE_MODELS.find((m) => m.id === g.governance); const memberAgents = g.members.map((mid) => agents.find((a) => a.id === mid)).filter(Boolean); const isSelected = selectedGroup === g.id; return (
                  <div key={g.id} onClick={() => setSelectedGroup(isSelected ? null : g.id)} style={{ background: isSelected ? g.color + "08" : "rgba(255,255,255,0.02)", border: `1px solid ${isSelected ? g.color + "35" : "rgba(255,255,255,0.05)"}`, borderRadius: 10, padding: 18, cursor: "pointer", transition: "all 0.2s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><div><div style={{ fontWeight: 600, fontSize: 14, fontFamily: "'Space Grotesk', sans-serif", color: g.color }}>⬡ {g.name}</div><div style={{ fontSize: 10, color: "#71717a", marginTop: 2 }}>{gov?.icon} {gov?.label}</div></div><span style={{ fontSize: 10, color: "#52525b", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 4 }}>{memberAgents.length} members</span></div>
                    <div style={{ marginTop: 12, fontSize: 10 }}><div style={{ color: "#52525b", marginBottom: 4, letterSpacing: "0.05em" }}>GROUP DID</div><div style={{ color: "#a1a1aa", wordBreak: "break-all" }}>{g.did}</div></div>
                    {g.governance === "threshold" && <div style={{ marginTop: 10, fontSize: 10, color: "#71717a" }}>Threshold: <span style={{ color: g.color }}>{g.threshold}</span> of {memberAgents.length}</div>}
                    <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>{memberAgents.map((a) => { const role = ROLES.find((r) => r.id === a.role); return (<span key={a.id} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 10, background: role.color + "12", color: role.color, border: `1px solid ${role.color}25`, display: "flex", alignItems: "center", gap: 4 }}>{role.icon} {a.name}{a.prompt && <span style={{ fontSize: 8, opacity: 0.6 }}>◆</span>}</span>); })}</div>
                    {isSelected && <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${g.color}15` }}>{sectionTitle("Member Capabilities")}{memberAgents.map((a) => (<div key={a.id} style={{ padding: "8px 10px", marginBottom: 6, borderRadius: 6, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.04)" }}><div style={{ fontSize: 10, fontWeight: 500, marginBottom: 3 }}>{a.name}</div><div style={{ fontSize: 9, color: a.prompt ? "#a1a1aa" : "#3f3f46", lineHeight: 1.5 }}>{a.prompt || "No prompt defined"}</div></div>))}<div style={{ display: "flex", gap: 8, marginTop: 8 }}><button onClick={(e) => { e.stopPropagation(); setBroadcastGroup(g.id); setView("messages"); }} style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24", padding: "6px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Broadcast</button><button onClick={(e) => { e.stopPropagation(); removeGroup(g.id); }} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", padding: "6px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Dissolve</button></div></div>}
                  </div>); })}
              </div>
            </div>
          )}

          {/* ═══ MESSAGES ═══ */}
          {view === "messages" && (
            <div style={{ display: "flex", gap: 16, height: "calc(100vh - 120px)" }}>
              <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Messages</h2>
                {sectionTitle("P2P Channels")}
                {channels.length === 0 && <div style={{ fontSize: 10, color: "#3f3f46", padding: 8 }}>No channels</div>}
                {channels.map((ch) => { const from = agents.find((a) => a.id === ch.from); const to = agents.find((a) => a.id === ch.to); const msgCount = messages.filter((m) => m.channelId === ch.id).length; if (!from || !to) return null; const isAc = activeChannel === ch.id && !broadcastGroup; return (
                  <button key={ch.id} onClick={() => { setActiveChannel(ch.id); setBroadcastGroup(null); }} style={{ background: isAc ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${isAc ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.05)"}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "block", width: "100%" }}>
                    <div style={{ fontSize: 11, color: isAc ? "#fbbf24" : "#a1a1aa" }}>{from.name} ⟷ {to.name}</div>
                    <div style={{ fontSize: 9, color: "#52525b", marginTop: 3 }}>{CHANNEL_TYPES.find((t) => t.id === ch.type)?.icon} {CHANNEL_TYPES.find((t) => t.id === ch.type)?.label}{msgCount > 0 && <span style={{ marginLeft: 8, color: "#fbbf24" }}>{msgCount} msgs</span>}</div>
                  </button>); })}
                {groups.length > 0 && <><div style={{ marginTop: 8 }}>{sectionTitle("Group Broadcast")}</div>{groups.map((g) => { const isAc = broadcastGroup === g.id; return (<button key={g.id} onClick={() => { setBroadcastGroup(g.id); setActiveChannel(null); }} style={{ background: isAc ? g.color + "12" : "rgba(255,255,255,0.02)", border: `1px solid ${isAc ? g.color + "30" : "rgba(255,255,255,0.05)"}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "block", width: "100%" }}><div style={{ fontSize: 11, color: isAc ? g.color : "#a1a1aa" }}>⬡ {g.name}</div><div style={{ fontSize: 9, color: "#52525b", marginTop: 3 }}>{g.members.length} members</div></button>); })}</>}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.2)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden" }}>
                {(activeChannel || broadcastGroup) ? (<>
                  <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}>
                    {activeChannel && !broadcastGroup && acFrom && acTo && <div><div style={{ fontSize: 13, fontWeight: 500 }}><span style={{ color: ROLES.find(r => r.id === acFrom.role)?.color }}>{acFrom.name}</span><span style={{ color: "#52525b", margin: "0 8px" }}>→</span><span style={{ color: ROLES.find(r => r.id === acTo.role)?.color }}>{acTo.name}</span></div><div style={{ fontSize: 9, color: "#52525b", marginTop: 4 }}>{acTo.prompt ? `${acTo.name} will respond using its prompt` : `${acTo.name} has no prompt`}</div></div>}
                    {broadcastGroup && <div><div style={{ fontSize: 13, fontWeight: 500, color: groups.find(g => g.id === broadcastGroup)?.color }}>⬡ {groups.find(g => g.id === broadcastGroup)?.name} — Broadcast</div></div>}
                  </div>
                  <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
                    {activeChannel && !broadcastGroup && channelMessages.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#3f3f46" }}><div style={{ fontSize: 24, marginBottom: 8 }}>◆</div><div style={{ fontSize: 11 }}>No messages yet.</div></div>}
                    {activeChannel && !broadcastGroup && channelMessages.map((m) => {
                      const sender = agents.find((a) => a.id === m.fromId); const receiver = agents.find((a) => a.id === m.toId);
                      const sRole = sender ? ROLES.find(r => r.id === sender.role) : null; const rRole = receiver ? ROLES.find(r => r.id === receiver.role) : null;
                      return (<div key={m.id} style={{ marginBottom: 20 }}>
                        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: (sRole?.color || "#555") + "20", border: `1px solid ${sRole?.color || "#555"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{sRole?.icon}</div>
                          <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: sRole?.color, marginBottom: 4 }}>{sender?.name} <span style={{ color: "#3f3f46", fontSize: 9 }}>{new Date(m.ts).toLocaleTimeString()}</span></div><div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "2px 10px 10px 10px", padding: "10px 14px", fontSize: 12, lineHeight: 1.6, color: "#d4d4d8" }}>{m.content}</div></div>
                        </div>
                        {m.status === "sending" && <div style={{ paddingLeft: 38, fontSize: 11, color: "#fbbf24" }}><span style={{ animation: "pulse 1.5s infinite" }}>●</span> {receiver?.name} is thinking...</div>}
                        {m.response && <div style={{ display: "flex", gap: 10, paddingLeft: 38 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: (rRole?.color || "#555") + "20", border: `1px solid ${rRole?.color || "#555"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{rRole?.icon}</div>
                          <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: rRole?.color, marginBottom: 4 }}>{receiver?.name} <span style={{ color: m.status === "no-prompt" ? "#ef4444" : "#3f3f46", fontSize: 9 }}>{m.status === "no-prompt" ? "no prompt" : "response"}</span></div><div style={{ background: m.status === "no-prompt" ? "rgba(239,68,68,0.05)" : (rRole?.color || "#555") + "08", border: `1px solid ${m.status === "no-prompt" ? "rgba(239,68,68,0.15)" : (rRole?.color || "#555") + "15"}`, borderRadius: "10px 2px 10px 10px", padding: "10px 14px", fontSize: 12, lineHeight: 1.6, color: m.status === "no-prompt" ? "#71717a" : "#d4d4d8", whiteSpace: "pre-wrap" }}>{m.response}</div></div>
                        </div>}
                      </div>);
                    })}
                    {broadcastGroup && (() => { const group = groups.find((g) => g.id === broadcastGroup); if (!group) return null; const bMsgs = messages.filter((m) => m.content.includes(`[GROUP BROADCAST — ${group.name}]`) && group.members.includes(m.toId)); if (bMsgs.length === 0) return <div style={{ textAlign: "center", padding: 40, color: "#3f3f46" }}><div style={{ fontSize: 24, marginBottom: 8 }}>⬡</div><div style={{ fontSize: 11 }}>No broadcasts yet.</div></div>; return bMsgs.map((m) => { const receiver = agents.find((a) => a.id === m.toId); const rRole = receiver ? ROLES.find(r => r.id === receiver.role) : null; return (<div key={m.id} style={{ marginBottom: 14, display: "flex", gap: 10 }}><div style={{ width: 28, height: 28, borderRadius: 6, background: (rRole?.color || "#555") + "20", border: `1px solid ${rRole?.color || "#555"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{rRole?.icon}</div><div style={{ flex: 1 }}><div style={{ fontSize: 10, color: rRole?.color, marginBottom: 4 }}>{receiver?.name}</div>{m.response && <div style={{ background: (rRole?.color || "#555") + "08", border: `1px solid ${(rRole?.color || "#555")}15`, borderRadius: 8, padding: "10px 14px", fontSize: 12, lineHeight: 1.6, color: "#d4d4d8", whiteSpace: "pre-wrap" }}>{m.response}</div>}{m.status === "sending" && <div style={{ fontSize: 11, color: "#fbbf24" }}>● thinking...</div>}</div></div>); }); })()}
                    <div ref={msgEndRef} />
                  </div>
                  <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}>
                    {activeChannel && !broadcastGroup && <div style={{ display: "flex", gap: 10 }}><input placeholder={`Message ${acTo?.name || "agent"}...`} value={msgInput} onChange={(e) => setMsgInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()} disabled={sending} style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)", opacity: sending ? 0.5 : 1 }} /><button onClick={sendMessage} disabled={sending || !msgInput.trim()} style={{ background: sending ? "#3f3f46" : "#fbbf24", color: "#0a0a0f", border: "none", padding: "10px 18px", borderRadius: 6, cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{sending ? "…" : "Send"}</button></div>}
                    {broadcastGroup && <div style={{ display: "flex", gap: 10 }}><input placeholder="Broadcast to all members..." value={broadcastInput} onChange={(e) => setBroadcastInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendBroadcast()} disabled={broadcasting} style={{ ...inputStyle, border: `1px solid ${groups.find(g => g.id === broadcastGroup)?.color || "#f472b6"}25`, opacity: broadcasting ? 0.5 : 1 }} /><button onClick={sendBroadcast} disabled={broadcasting || !broadcastInput.trim()} style={{ background: broadcasting ? "#3f3f46" : groups.find(g => g.id === broadcastGroup)?.color || "#f472b6", color: "#0a0a0f", border: "none", padding: "10px 18px", borderRadius: 6, cursor: broadcasting ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{broadcasting ? "…" : "Broadcast"}</button></div>}
                  </div>
                </>) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#3f3f46" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 32, marginBottom: 12 }}>◆</div><div style={{ fontSize: 12 }}>Select a channel or group.</div></div></div>
                )}
              </div>
            </div>
          )}

          {/* ═══ NETWORK ═══ */}
          {view === "network" && (
            <div style={{ height: "calc(100vh - 120px)" }}>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Network Topology</h2>
              {agents.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "#3f3f46", border: "1px dashed rgba(0,229,160,0.1)", borderRadius: 12, height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ fontSize: 12 }}>Create agents to visualize the mesh.</div></div> : (
                <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,229,160,0.08)", borderRadius: 12, height: "calc(100% - 50px)", overflow: "hidden" }}>
                  <NetworkCanvas agents={agents} channels={channels} groups={groups} activeChannels={activeChannels} />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
        select option { background: #18181b; color: #e4e4e7; }
      `}</style>
    </div>
  );
}
