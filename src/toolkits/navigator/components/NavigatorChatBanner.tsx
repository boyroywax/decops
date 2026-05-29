import { useEffect, useState } from "react";
import { Compass, Target, Users, AlertTriangle } from "lucide-react";
import { navigatorService } from "../service";
import type { NavigatorSnapshot } from "../types";

/**
 * Compact status banner shown inside the chat panel when the Navigator
 * chat agent is active. Reuses the shared `.libp2p-chat-banner*` rules
 * so the visual language matches the other sub-agent banners.
 */
export function NavigatorChatBanner() {
  const [snap, setSnap] = useState<NavigatorSnapshot>(() => navigatorService.snapshot());

  useEffect(() => {
    const unsub = navigatorService.subscribe(setSnap);
    return () => { unsub(); };
  }, []);

  const inFlight = snap.goals.filter((g) => g.status === "executing" || g.status === "planning").length;
  const blocked = snap.goals.filter((g) => g.status === "blocked" || g.status === "failed").length;
  const active = snap.activeGoalId ? snap.goals.find((g) => g.id === snap.activeGoalId) : undefined;

  return (
    <div className="libp2p-chat-banner">
      <div className="libp2p-chat-banner__stat">
        <Compass size={11} />
        <span className="libp2p-chat-banner__value">{snap.goals.length}</span>
        <span className="libp2p-chat-banner__label">Goals</span>
      </div>
      <div className="libp2p-chat-banner__stat">
        <Target size={11} />
        <span className="libp2p-chat-banner__value">{inFlight}</span>
        <span className="libp2p-chat-banner__label">In&nbsp;flight</span>
      </div>
      <div className="libp2p-chat-banner__stat">
        <Users size={11} />
        <span className="libp2p-chat-banner__value">{snap.huddles.length}</span>
        <span className="libp2p-chat-banner__label">Huddles</span>
      </div>
      <div className="libp2p-chat-banner__stat">
        <AlertTriangle size={11} />
        <span className="libp2p-chat-banner__value">{blocked}</span>
        <span className="libp2p-chat-banner__label">Blocked</span>
      </div>
      {active ? (
        <div className="libp2p-chat-banner__stat" title={`Active: ${active.title}`}>
          <span className="libp2p-chat-banner__label">{active.title.slice(0, 32)}</span>
        </div>
      ) : null}
    </div>
  );
}
