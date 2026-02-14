import { useRef, useEffect } from "react";
import type { Agent, Channel, Group } from "../../types";
import { ROLES } from "../../constants";

interface NetworkCanvasProps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  activeChannels: Set<string>;
}

export function NetworkCanvas({ agents, channels, groups, activeChannels }: NetworkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrame = useRef<number>(0);
  const positions = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
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

      // Grid
      ctx.strokeStyle = "rgba(0,229,160,0.04)";
      ctx.lineWidth = 0.5;
      for (let x = 0; x < cw; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
      for (let y = 0; y < ch; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }

      // Groups
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
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.arc(cx2, cy2, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = "500 8px 'DM Mono', monospace";
        ctx.fillStyle = (g.color || "#f472b6") + "80";
        ctx.textAlign = "center";
        ctx.fillText(`⬡ ${g.name}`, cx2, cy2 - radius - 6);
      });

      // Channels
      channels.forEach((ch_item) => {
        const from = positions.current[ch_item.from];
        const to = positions.current[ch_item.to];
        if (!from || !to) return;
        const isActive = activeChannels.has(ch_item.id);
        const typeColor = ch_item.type === "data" ? "#00e5a0" : ch_item.type === "task" ? "#fbbf24" : "#a78bfa";
        ctx.beginPath();
        ctx.strokeStyle = typeColor + (isActive ? "80" : "40");
        ctx.lineWidth = isActive ? 2.5 : 1.5;
        ctx.setLineDash(isActive ? [] : [4, 6]);
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const pulseCount = isActive ? 3 : 1;
        for (let p = 0; p < pulseCount; p++) {
          const progress = ((tick * (isActive ? 1.5 : 0.8) + ch_item.offset + p * 40) % 120) / 120;
          const px = from.x + (to.x - from.x) * progress;
          const py = from.y + (to.y - from.y) * progress;
          ctx.beginPath();
          ctx.fillStyle = typeColor + (isActive ? "ff" : "cc");
          ctx.arc(px, py, isActive ? 3.5 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (isActive) {
          const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          const glowR = 12 + Math.sin(tick * 0.1) * 4;
          const glow = ctx.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, glowR);
          glow.addColorStop(0, typeColor + "40");
          glow.addColorStop(1, typeColor + "00");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Agents
      agents.forEach((a) => {
        const pos = positions.current[a.id];
        if (!pos) return;
        const role = ROLES.find(r => r.id === a.role);
        const color = role?.color || "#00e5a0";
        const hasPrompt = a.prompt && a.prompt.trim().length > 0;
        const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 28);
        grad.addColorStop(0, color + "30");
        grad.addColorStop(1, color + "00");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = color + "90";
        ctx.lineWidth = 1.5;
        ctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2);
        ctx.stroke();
        if (hasPrompt) {
          ctx.beginPath();
          ctx.strokeStyle = color + "40";
          ctx.lineWidth = 0.8;
          ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.fillStyle = color + "20";
        ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(role?.icon || "●", pos.x, pos.y);
        ctx.font = "600 9px 'DM Mono', monospace";
        ctx.fillStyle = "#d4d4d8";
        ctx.fillText(a.name, pos.x, pos.y + 26);
      });

      animFrame.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animFrame.current);
  }, [agents, channels, groups, activeChannels]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}
