/**
 * Diff helpers for the live p2p runtime snapshot carried in
 * {@link WorkspaceContext.p2p}. Used by the chat panel to detect
 * manual user changes (start/stop nodes, open/close databases, etc.)
 * and emit a synthetic system-notice message so the agent stays
 * informed about workspace runtime state between turns.
 */

import type { WorkspaceP2PContext } from "./prompts";
import type { Libp2pSnapshot } from "@/toolkits/libp2p";
import type { HeliaSnapshot } from "@/toolkits/helia";
import type { OrbitdbSnapshot } from "@/toolkits/orbitdb";

function shortPeer(id: string | null | undefined): string {
    if (!id) return "no-peer";
    return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function diffLibp2p(prev: Libp2pSnapshot[], next: Libp2pSnapshot[]): string[] {
    const out: string[] = [];
    const prevById = new Map(prev.map(n => [n.nodeId, n]));
    const nextById = new Map(next.map(n => [n.nodeId, n]));
    for (const n of next) {
        const p = prevById.get(n.nodeId);
        if (!p) {
            out.push(`libp2p node "${n.label}" added (status=${n.status})`);
            continue;
        }
        if (p.status !== n.status) {
            out.push(`libp2p node "${n.label}" status: ${p.status} → ${n.status}${n.peerId ? ` (peer ${shortPeer(n.peerId)})` : ""}`);
        }
        // topics changes (subscribe/unsubscribe)
        const addedTopics = (n.topics ?? []).filter(t => !(p.topics ?? []).includes(t));
        const removedTopics = (p.topics ?? []).filter(t => !(n.topics ?? []).includes(t));
        if (addedTopics.length) out.push(`libp2p "${n.label}" subscribed to topics: ${addedTopics.join(", ")}`);
        if (removedTopics.length) out.push(`libp2p "${n.label}" unsubscribed from topics: ${removedTopics.join(", ")}`);
    }
    for (const p of prev) {
        if (!nextById.has(p.nodeId)) out.push(`libp2p node "${p.label}" removed`);
    }
    return out;
}

function diffHelia(prev: HeliaSnapshot[], next: HeliaSnapshot[]): string[] {
    const out: string[] = [];
    const prevById = new Map(prev.map(n => [n.nodeId, n]));
    const nextById = new Map(next.map(n => [n.nodeId, n]));
    for (const n of next) {
        const p = prevById.get(n.nodeId);
        if (!p) {
            out.push(`helia node "${n.label}" added (status=${n.status})`);
            continue;
        }
        if (p.status !== n.status) {
            out.push(`helia node "${n.label}" status: ${p.status} → ${n.status}`);
        }
        const prevCount = p.entries?.length ?? 0;
        const nextCount = n.entries?.length ?? 0;
        if (nextCount !== prevCount) {
            out.push(`helia "${n.label}" entries: ${prevCount} → ${nextCount}`);
        }
    }
    for (const p of prev) {
        if (!nextById.has(p.nodeId)) out.push(`helia node "${p.label}" removed`);
    }
    return out;
}

function diffOrbitdb(prev: OrbitdbSnapshot[], next: OrbitdbSnapshot[]): string[] {
    const out: string[] = [];
    const prevById = new Map(prev.map(n => [n.nodeId, n]));
    const nextById = new Map(next.map(n => [n.nodeId, n]));
    for (const n of next) {
        const p = prevById.get(n.nodeId);
        if (!p) {
            out.push(`orbitdb node "${n.label}" added (status=${n.status})`);
            continue;
        }
        if (p.status !== n.status) {
            out.push(`orbitdb node "${n.label}" status: ${p.status} → ${n.status}`);
        }
        const prevDbs = new Map((p.databases ?? []).map(d => [d.address, d]));
        const nextDbs = new Map((n.databases ?? []).map(d => [d.address, d]));
        for (const [addr, d] of nextDbs) {
            const pd = prevDbs.get(addr);
            if (!pd) {
                out.push(`orbitdb "${n.label}" opened database "${d.name}" (${d.type})`);
            } else if (pd.open !== d.open) {
                out.push(`orbitdb "${n.label}" database "${d.name}" ${d.open ? "opened" : "closed"}`);
            }
        }
        for (const [addr, pd] of prevDbs) {
            if (!nextDbs.has(addr)) out.push(`orbitdb "${n.label}" removed database "${pd.name}"`);
        }
    }
    for (const p of prev) {
        if (!nextById.has(p.nodeId)) out.push(`orbitdb node "${p.label}" removed`);
    }
    return out;
}

/** Produce a list of human-readable change descriptions between two
 *  p2p snapshots. Returns an empty array when nothing meaningful
 *  changed. */
export function diffP2PContext(
    prev: WorkspaceP2PContext | undefined,
    next: WorkspaceP2PContext | undefined,
): string[] {
    if (!next) return [];
    if (!prev) return []; // first observation — establish baseline silently
    const lines: string[] = [];
    lines.push(...diffLibp2p(prev.libp2p.nodes, next.libp2p.nodes));
    lines.push(...diffHelia(prev.helia.nodes, next.helia.nodes));
    lines.push(...diffOrbitdb(prev.orbitdb.nodes, next.orbitdb.nodes));
    if (prev.libp2p.activeId !== next.libp2p.activeId) {
        const label = next.libp2p.nodes.find(n => n.nodeId === next.libp2p.activeId)?.label ?? "(none)";
        lines.push(`libp2p active node → "${label}"`);
    }
    if (prev.helia.activeId !== next.helia.activeId) {
        const label = next.helia.nodes.find(n => n.nodeId === next.helia.activeId)?.label ?? "(none)";
        lines.push(`helia active node → "${label}"`);
    }
    if (prev.orbitdb.activeId !== next.orbitdb.activeId) {
        const label = next.orbitdb.nodes.find(n => n.nodeId === next.orbitdb.activeId)?.label ?? "(none)";
        lines.push(`orbitdb active node → "${label}"`);
    }
    return lines;
}
