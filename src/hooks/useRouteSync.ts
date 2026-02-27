import { useEffect, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import type { ViewId, NavContext } from "../types";

/** Map ViewId to URL path segment */
const VIEW_TO_PATH: Record<string, string> = {
  networks: "/networks",
  ecosystem: "/networks",  // Legacy alias
  agents: "/agents",
  channels: "/channels",
  groups: "/groups",
  messages: "/messages",
  network: "/topology",
  artifacts: "/artifacts",
  activity: "/activity",
  actions: "/actions",
  jobs: "/jobs",
  editor: "/editor",
};

/** Map URL path segment back to ViewId */
const PATH_TO_VIEW: Record<string, ViewId> = {
  networks: "networks",
  agents: "agents",
  channels: "channels",
  groups: "groups",
  messages: "messages",
  topology: "network",
  artifacts: "artifacts",
  activity: "activity",
  actions: "actions",
  jobs: "jobs",
  editor: "editor",
};

/**
 * Build a URL path from ViewId + NavContext.
 * Examples:
 *   ("networks", {}) → "/networks"
 *   ("networks", { networkId: "abc" }) → "/networks/abc"
 *   ("networks", { networkId: "abc", groupId: "def" }) → "/networks/abc/groups/def"
 *   ("networks", { networkId: "abc", agentId: "ghi" }) → "/networks/abc/agents/ghi"
 */
export function buildPath(view: ViewId, ctx: NavContext): string {
  const base = VIEW_TO_PATH[view] || "/networks";

  if (view === "networks" || view === "ecosystem") {
    if (ctx.agentId && ctx.networkId) {
      const groupSeg = ctx.groupId ? `/groups/${ctx.groupId}` : "";
      return `/networks/${ctx.networkId}${groupSeg}/agents/${ctx.agentId}`;
    }
    if (ctx.groupId && ctx.networkId) {
      return `/networks/${ctx.networkId}/groups/${ctx.groupId}`;
    }
    if (ctx.networkId) {
      return `/networks/${ctx.networkId}`;
    }
  }

  return base;
}

/**
 * Parse current URL path into ViewId + NavContext.
 */
export function parsePath(pathname: string): { view: ViewId; navContext: NavContext } {
  const segments = pathname.split("/").filter(Boolean);

  // /networks/:networkId/agents/:agentId
  // /networks/:networkId/groups/:groupId/agents/:agentId
  // /networks/:networkId/groups/:groupId
  // /networks/:networkId
  // /networks
  if (segments[0] === "networks") {
    const networkId = segments[1];
    if (!networkId) return { view: "networks", navContext: {} };

    // /networks/:nid/groups/:gid/agents/:aid
    if (segments[2] === "groups" && segments[4] === "agents") {
      return {
        view: "networks",
        navContext: { networkId, groupId: segments[3], agentId: segments[5] },
      };
    }
    // /networks/:nid/agents/:aid
    if (segments[2] === "agents" && segments[3]) {
      return {
        view: "networks",
        navContext: { networkId, agentId: segments[3] },
      };
    }
    // /networks/:nid/groups/:gid
    if (segments[2] === "groups" && segments[3]) {
      return {
        view: "networks",
        navContext: { networkId, groupId: segments[3] },
      };
    }
    // /networks/:nid
    return {
      view: "networks",
      navContext: { networkId },
    };
  }

  // Simple flat routes
  const viewId = PATH_TO_VIEW[segments[0]];
  if (viewId) return { view: viewId, navContext: {} };

  // Default
  return { view: "networks", navContext: {} };
}

/**
 * Hook that synchronizes URL ↔ (ViewId, NavContext).
 * - On mount: reads URL and calls setView/setNavContext
 * - On state change: pushes new URL
 * - On browser back/forward: updates state
 */
export function useRouteSync(
  view: ViewId,
  navContext: NavContext,
  setViewRaw: (v: ViewId) => void,
  setNavContext: (ctx: NavContext) => void,
) {
  const navigate = useNavigate();
  const location = useLocation();
  const isInternalNav = useRef(false);
  const initialized = useRef(false);

  // On mount: parse URL → state (only once)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const { view: urlView, navContext: urlCtx } = parsePath(location.pathname);
    // Only override default if URL is not root "/"
    if (location.pathname !== "/" || urlView !== "networks") {
      setViewRaw(urlView);
      setNavContext(urlCtx);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // State → URL: when view or navContext changes, update URL
  useEffect(() => {
    if (!initialized.current) return;

    const targetPath = buildPath(view, navContext);
    if (location.pathname !== targetPath) {
      isInternalNav.current = true;
      navigate(targetPath, { replace: false });
    }
  }, [view, navContext]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL → State: handle popstate (back/forward)
  useEffect(() => {
    if (isInternalNav.current) {
      isInternalNav.current = false;
      return;
    }

    const { view: urlView, navContext: urlCtx } = parsePath(location.pathname);
    const currentPath = buildPath(view, navContext);
    if (location.pathname !== currentPath) {
      setViewRaw(urlView);
      setNavContext(urlCtx);
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
}
