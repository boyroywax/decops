import { useRef, useEffect } from "react";
import type { Network, Bridge } from "../../types";

interface EcosystemCanvasProps {
  networks: Network[];
  bridges: Bridge[];
  activeBridges: Set<string>;
}

export function EcosystemCanvas({ networks, bridges, activeBridges }: EcosystemCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrame = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const cw = w / 2, ch = h / 2;

    const netPos: Record<string, { x: number; y: number }> = {};
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
