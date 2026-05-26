import { useCallback, useEffect, useRef } from "react";
import { libp2pService } from "@/toolkits/libp2p";
import { heliaService } from "@/toolkits/helia";
import { orbitdbService } from "@/toolkits/orbitdb";
import { diffP2PContext } from "@/services/ai";
import type { ChatMessage, WorkspaceP2PContext } from "@/services/ai";
import type { Conversation } from "@/components/chat/types";
import { makeId } from "@/components/chat/utils";

/**
 * Subscribes to the three p2p toolkits (libp2p / helia / orbitdb) and emits
 * a single debounced `[workspace update]` notice into the active chat
 * conversation whenever the snapshot diff is non-empty.
 *
 * Read-time access to the latest snapshot is exposed via `readP2PContext()`
 * so the chat send pipeline can include a fresh p2p block in the LLM
 * prompt without forcing this panel to re-render on every pubsub event.
 *
 * Extracted from ChatPanel as part of §2.2 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
export function useP2PChatNotifications(params: {
  activeId: string | null;
  loading: boolean;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
}): { readP2PContext: () => WorkspaceP2PContext } {
  const { activeId, loading, setConversations } = params;

  const libp2pSnapRef = useRef(libp2pService.snapshot());
  const heliaSnapRef = useRef(heliaService.snapshot());
  const orbitdbSnapRef = useRef(orbitdbService.snapshot());
  const prevP2PRef = useRef<WorkspaceP2PContext | undefined>(undefined);
  const pendingP2PChangesRef = useRef<string[]>([]);
  const p2pNotifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadingRef = useRef(loading);
  const activeIdRef = useRef(activeId);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const readP2PContext = useCallback((): WorkspaceP2PContext => ({
    libp2p: { activeId: libp2pSnapRef.current.activeId, nodes: libp2pSnapRef.current.nodes },
    helia: { activeId: heliaSnapRef.current.activeId, nodes: heliaSnapRef.current.nodes },
    orbitdb: { activeId: orbitdbSnapRef.current.activeId, nodes: orbitdbSnapRef.current.nodes },
  }), []);

  const flushP2PNotices = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    const pending = pendingP2PChangesRef.current.splice(0);
    if (pending.length === 0) return;
    const seen = new Set<string>();
    const deduped = pending.filter(l => (seen.has(l) ? false : (seen.add(l), true)));
    const content = `[workspace update] ${deduped.join("; ")}`;
    const notice: ChatMessage = { id: makeId(), role: "user", content, systemNotice: true };
    setConversations(prev => prev.map(c =>
      c.id === id
        ? { ...c, messages: [...c.messages, notice], updatedAt: Date.now() }
        : c
    ));
  }, [setConversations]);

  const handleP2PChange = useCallback(() => {
    const next = readP2PContext();
    const prev = prevP2PRef.current;
    prevP2PRef.current = next;
    if (!prev) return; // baseline only — silent
    const changes = diffP2PContext(prev, next);
    if (changes.length === 0) return;
    pendingP2PChangesRef.current.push(...changes);
    if (p2pNotifyTimerRef.current) clearTimeout(p2pNotifyTimerRef.current);
    p2pNotifyTimerRef.current = setTimeout(() => {
      p2pNotifyTimerRef.current = null;
      if (loadingRef.current) return; // drained later via the idle effect
      flushP2PNotices();
    }, 600);
  }, [readP2PContext, flushP2PNotices]);

  useEffect(() => {
    // Establish baseline + subscribe. The subscribe callbacks only
    // mutate refs and possibly schedule a debounced React update.
    prevP2PRef.current = readP2PContext();
    const unsubLibp2p = libp2pService.subscribe(s => {
      libp2pSnapRef.current = s;
      handleP2PChange();
    });
    const unsubHelia = heliaService.subscribe(s => {
      heliaSnapRef.current = s;
      handleP2PChange();
    });
    const unsubOrbit = orbitdbService.subscribe(s => {
      orbitdbSnapRef.current = s;
      handleP2PChange();
    });
    return () => {
      unsubLibp2p();
      unsubHelia();
      unsubOrbit();
      if (p2pNotifyTimerRef.current) {
        clearTimeout(p2pNotifyTimerRef.current);
        p2pNotifyTimerRef.current = null;
      }
    };
  }, [readP2PContext, handleP2PChange]);

  // Drain buffered p2p change notices once a chat run completes.
  useEffect(() => {
    if (loading) return;
    if (pendingP2PChangesRef.current.length === 0) return;
    flushP2PNotices();
  }, [loading, flushP2PNotices]);

  return { readP2PContext };
}
