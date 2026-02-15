import { useRef, useEffect, useState } from "react";
import type { Agent, Channel, Group, Keystone } from "../../types";
import { ROLES } from "../../constants";

interface NetworkCanvasProps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  activeChannels: Set<string>;
}

interface Point { x: number; y: number; }
interface Node extends Point {
  id: string;
  vx: number;
  vy: number;
  type: "agent" | "keystone";
  mass: number;
  data: Agent | Keystone;
  pinned?: boolean;
  groupId?: string; // If keystone belongs to group
}

export function NetworkCanvas({ agents, channels, groups, activeChannels }: NetworkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrame = useRef<number>(0);

  // Physics state
  const nodes = useRef<Record<string, Node>>({});
  const [draggedNode, setDraggedNode] = useState<string | null>(null);

  // Initialize / Sync Nodes
  useEffect(() => {
    const currentNodes = nodes.current;

    // Sync Agents
    agents.forEach(a => {
      if (!currentNodes[a.id]) {
        currentNodes[a.id] = {
          id: a.id,
          x: Math.random() * 800,
          y: Math.random() * 600,
          vx: 0,
          vy: 0,
          type: "agent",
          mass: 1,
          data: a
        };
      } else {
        currentNodes[a.id].data = a;
      }
    });

    // Sync Group Keystones
    const activeKeystoneIds = new Set<string>();

    groups.forEach(g => {
      if (g.keystones && g.keystones.length > 0) {
        g.keystones.forEach((k, idx) => {
          activeKeystoneIds.add(k.id);
          if (!currentNodes[k.id]) {
            // Initial position near group center? 
            // We don't track group center explicitly in state, only derived in render.
            // Random start is fine, physics will pull it.
            currentNodes[k.id] = {
              id: k.id,
              x: Math.random() * 800,
              y: Math.random() * 600,
              vx: 0,
              vy: 0,
              type: "keystone",
              mass: k.weight ? 5 + (k.weight / 10) : 5,
              data: k,
              groupId: g.id,
              pinned: !!k.position
            };
          } else {
            currentNodes[k.id].data = k;
            currentNodes[k.id].groupId = g.id; // Ensure link
            // update mass etc?
          }
        });
      }
    });

    // Cleanup
    const agentIds = new Set(agents.map(a => a.id));
    Object.keys(currentNodes).forEach(id => {
      const node = currentNodes[id];
      if (node.type === "agent" && !agentIds.has(id)) delete currentNodes[id];
      if (node.type === "keystone" && !activeKeystoneIds.has(id)) delete currentNodes[id];
    });

  }, [agents, groups]);

  // Main Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.offsetWidth * 2;
        canvas.height = parent.offsetHeight * 2;
        ctx.scale(2, 2);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    let tick = 0;

    const loop = () => {
      tick++;
      const w = canvas.width / 2;
      const h = canvas.height / 2;
      const nodeList = Object.values(nodes.current);

      // --- Physics Step ---

      // Calculate Group Centers first for Keystone tethering
      const groupCenters: Record<string, Point> = {};
      groups.forEach(g => {
        const memberNodes = g.members.map(mid => nodes.current[mid]).filter(Boolean);
        if (memberNodes.length > 0) {
          const cx = memberNodes.reduce((s, n) => s + n.x, 0) / memberNodes.length;
          const cy = memberNodes.reduce((s, n) => s + n.y, 0) / memberNodes.length;
          groupCenters[g.id] = { x: cx, y: cy };
        }
      });

      // 1. Repulsion
      for (let i = 0; i < nodeList.length; i++) {
        for (let j = i + 1; j < nodeList.length; j++) {
          const n1 = nodeList[i];
          const n2 = nodeList[j];
          const dx = n1.x - n2.x;
          const dy = n1.y - n2.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq) || 1;

          const force = (n1.mass * n2.mass * 2000) / (distSq + 100);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!n1.pinned) { n1.vx += fx / n1.mass; n1.vy += fy / n1.mass; }
          if (!n2.pinned) { n2.vx -= fx / n2.mass; n2.vy -= fy / n2.mass; }
        }
      }

      // 2. Attraction (Springs) - Channels
      channels.forEach(ch => {
        const n1 = nodes.current[ch.from];
        const n2 = nodes.current[ch.to];
        if (n1 && n2) {
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 150) * 0.05;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!n1.pinned) { n1.vx += fx; n1.vy += fy; }
          if (!n2.pinned) { n2.vx -= fx; n2.vy -= fy; }
        }
      });

      // 3. Gravity & Keystone Logic
      nodeList.forEach(n => {
        // Center gravity (weak)
        if (!n.pinned) {
          n.vx += ((w / 2) - n.x) * 0.0005;
          n.vy += ((h / 2) - n.y) * 0.0005;
        }

        if (n.type === "keystone" && n.groupId && groupCenters[n.groupId]) {
          // Keystone tethered to group center
          const c = groupCenters[n.groupId];
          const kdx = c.x - n.x;
          const kdy = c.y - n.y;
          if (!n.pinned) {
            // Strong pull to stay with group
            n.vx += kdx * 0.02;
            n.vy += kdy * 0.02;
          }
          // Also pull agents in group towards keystone?
          // The keystone is already pulled to the group center (agents).
          // So effectively they cluster. 
          // We can add a force from Keystone -> Agents in group to "tighten" them?
        }

        if (n.type === "agent") {
          // If agent is in a group with keystones, pull them together?
          // already handled via group spring logic usually?
          // Let's rely on keystone pulling to center of agents, and agents pulling to channels.
          // Maybe check if any keystones attract this agent specifically via TAGS?
          // If so, add force.
          const agent = n.data as Agent;

          // Find keystones that match this agent's tags?
          // Loop all nodes to find keystones
          nodeList.forEach(other => {
            if (other.type === "keystone") {
              const k = other.data as Keystone;
              if (k.tags && (k.tags.includes(agent.role) || k.tags.includes(agent.id))) {
                // Specific attraction
                const kdx = other.x - n.x;
                const kdy = other.y - n.y;
                if (!n.pinned) {
                  n.vx += kdx * 0.005; // Extra pull
                  n.vy += kdy * 0.005;
                }
              }
            }
          });
        }
      });

      // 4. Update Position & Damping
      nodeList.forEach(n => {
        if (draggedNode === n.id) {
          n.vx = 0; n.vy = 0;
        } else if (!n.pinned) {
          n.vx *= 0.92;
          n.vy *= 0.92;
          n.x += n.vx;
          n.y += n.vy;

          if (n.x < 20) n.x = 20; if (n.x > w - 20) n.x = w - 20;
          if (n.y < 20) n.y = 20; if (n.y > h - 20) n.y = h - 20;
        }
      });


      // --- Render Step ---
      ctx.clearRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "rgba(0,229,160,0.04)";
      ctx.lineWidth = 0.5;
      for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      // Groups Backgrounds
      groups.forEach((g) => {
        const mp = g.members.map((mid) => nodes.current[mid]).filter(Boolean);
        if (mp.length < 2 && (!g.keystones || g.keystones.length === 0)) return;

        // Include keystones in group envelope calc
        if (g.keystones) {
          g.keystones.forEach(k => {
            const kn = nodes.current[k.id];
            if (kn) mp.push(kn);
          });
        }

        if (mp.length < 1) return;

        const cx2 = mp.reduce((s, p) => s + p.x, 0) / mp.length;
        const cy2 = mp.reduce((s, p) => s + p.y, 0) / mp.length;
        const maxD = Math.max(...mp.map((p) => Math.sqrt((p.x - cx2) ** 2 + (p.y - cy2) ** 2)));
        const radius = maxD + 40;
        const pulse = Math.sin(tick * 0.02) * 0.15 + 0.85;

        ctx.beginPath();
        const baseColor = g.color || "#f472b6";
        ctx.strokeStyle = baseColor + Math.round(40 * pulse).toString(16).padStart(2, "0");
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.arc(cx2, cy2, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = "500 8px 'DM Mono', monospace";
        ctx.fillStyle = baseColor + "80";
        ctx.textAlign = "center";
        ctx.fillText(`⬡ ${g.name}`, cx2, cy2 - radius - 6);
      });

      // Keystones Visuals
      nodeList.forEach(n => {
        if (n.type === "keystone") {
          const k = n.data as Keystone;
          const pulse = Math.sin(tick * 0.05) * 3 + 6;

          // Glow
          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 20 + pulse);
          grad.addColorStop(0, "rgba(251, 191, 36, 0.4)");
          grad.addColorStop(1, "rgba(251, 191, 36, 0)");
          ctx.beginPath();
          ctx.fillStyle = grad;
          ctx.arc(n.x, n.y, 30 + pulse, 0, Math.PI * 2);
          ctx.fill();

          // Diamond
          const size = 12 + (k.weight / 10);
          ctx.beginPath();
          ctx.fillStyle = "#fbbf24";
          ctx.moveTo(n.x, n.y - size);
          ctx.lineTo(n.x + size, n.y);
          ctx.lineTo(n.x, n.y + size);
          ctx.lineTo(n.x - size, n.y);
          ctx.fill();

          // Label
          ctx.font = "bold 9px 'Space Grotesk'";
          ctx.fillStyle = "#fbbf24";
          ctx.textAlign = "center";
          ctx.fillText(k.label, n.x, n.y + size + 10);
        }
      });


      // Channels
      channels.forEach(ch => {
        const n1 = nodes.current[ch.from];
        const n2 = nodes.current[ch.to];
        if (!n1 || !n2) return;

        const isActive = activeChannels.has(ch.id);
        const typeColor = ch.type === "data" ? "#00e5a0" : ch.type === "task" ? "#fbbf24" : "#a78bfa";

        if (isActive) {
          const mid = { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 };
          const glowR = 12 + Math.sin(tick * 0.1) * 4;
          const glow = ctx.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, glowR);
          glow.addColorStop(0, typeColor + "40");
          glow.addColorStop(1, typeColor + "00");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.strokeStyle = typeColor + (isActive ? "80" : "40");
        ctx.lineWidth = isActive ? 2.5 : 1.5;
        ctx.setLineDash(isActive ? [] : [4, 6]);
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const pulseCount = isActive ? 3 : 1;
        for (let p = 0; p < pulseCount; p++) {
          const particleT = ((tick * (isActive ? 1.5 : 0.8) + (ch.offset || 0) + p * 40) % 120) / 120;
          const px = n1.x + (n2.x - n1.x) * particleT;
          const py = n1.y + (n2.y - n1.y) * particleT;
          ctx.beginPath();
          ctx.fillStyle = typeColor + (isActive ? "ff" : "cc");
          ctx.arc(px, py, isActive ? 3.5 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Agents
      nodeList.forEach(n => {
        if (n.type === "agent") {
          const agent = n.data as Agent;
          const role = ROLES.find(r => r.id === agent.role);
          const color = role?.color || "#00e5a0";
          const hasPrompt = agent.prompt && agent.prompt.trim().length > 0;

          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 28);
          grad.addColorStop(0, color + "30");
          grad.addColorStop(1, color + "00");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 28, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.strokeStyle = color + "90";
          ctx.lineWidth = 1.5;
          ctx.arc(n.x, n.y, 16, 0, Math.PI * 2);
          ctx.stroke();

          if (hasPrompt) {
            ctx.beginPath();
            ctx.strokeStyle = color + "40";
            ctx.lineWidth = 0.8;
            ctx.arc(n.x, n.y, 20, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.fillStyle = color + "20";
          ctx.arc(n.x, n.y, 14, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#fff";
          ctx.font = "12px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(role?.char || "●", n.x, n.y);

          ctx.font = "600 9px 'DM Mono', monospace";
          ctx.fillStyle = "#d4d4d8";
          ctx.fillText(agent.name, n.x, n.y + 32);
        }
      });

      animFrame.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(animFrame.current);
      window.removeEventListener('resize', resize);
    };
  }, [agents, channels, groups, activeChannels, draggedNode]);

  // Interaction Handlers (Simplified)
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clicked = Object.values(nodes.current).find(n => {
      const dist = Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2);
      return dist < 25;
    });

    if (clicked) {
      setDraggedNode(clicked.id);
      clicked.x = x; clicked.y = y;
      clicked.pinned = true;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedNode) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const node = nodes.current[draggedNode];
    if (node) {
      node.x = x; node.y = y;
      node.vx = 0; node.vy = 0;
    }
  };

  const handleMouseUp = () => {
    if (draggedNode) {
      const node = nodes.current[draggedNode];
      if (node) node.pinned = false; // Release
      setDraggedNode(null);
    }
  };

  return <canvas
    ref={canvasRef}
    onMouseDown={handleMouseDown}
    onMouseMove={handleMouseMove}
    onMouseUp={handleMouseUp}
    onMouseLeave={handleMouseUp}
    style={{ width: "100%", height: "100%", display: "block", cursor: draggedNode ? "grabbing" : "default" }}
  />;
}
