/**
 * Toolkit UI Registry — runtime component contributions.
 *
 * Toolkits register React providers, views, and global overlays here.
 * Core (`Main.tsx`, `ViewSwitcher`, etc.) discovers them dynamically,
 * eliminating hard-coded imports for toolkit UI surfaces.
 *
 * This complements the declarative `ToolkitUI` facet in types.ts —
 * the facet describes metadata (icons, labels, routes), while this
 * registry holds live React component references at runtime.
 */

import type { ComponentType, ReactNode } from "react";
import type { ViewId } from "@/types";

// ── Provider contribution ────────────────────────

/** A React context provider that wraps part of the component tree. */
export interface ToolkitProviderContribution {
  /** Toolkit that registered this provider (for debugging/ordering). */
  toolkitId: string;
  /** The provider component.  Must accept `{ children: ReactNode }`. */
  Provider: ComponentType<{ children: ReactNode }>;
  /**
   * Ordering hint — lower numbers wrap closer to the root.
   * Default: 100.  Core contexts (Jobs, Workspace, LLM) are < 50.
   */
  order?: number;
}

// ── View contribution ────────────────────────────

/** A top-level view contributed by a toolkit. */
export interface ToolkitViewContribution {
  /** Toolkit that registered this view. */
  toolkitId: string;
  /** ViewId(s) this component handles. */
  viewIds: ViewId[];
  /**
   * The view component.  Receives at minimum:
   *   - `navigateTo`
   *   - `workspace` (WorkspaceContextType)
   * Additional props are passed through from ViewSwitcher.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: ComponentType<any>;
}

// ── Global overlay / component contribution ──────

/** A component rendered unconditionally inside the provider tree (modals, FABs, etc.). */
export interface ToolkitGlobalContribution {
  /** Toolkit that registered this global. */
  toolkitId: string;
  /** Unique key for React reconciliation. */
  key: string;
  /** The component to render (receives no props). */
  Component: ComponentType;
}

// ── Registry ─────────────────────────────────────

const providers: ToolkitProviderContribution[] = [];
const views: ToolkitViewContribution[] = [];
const globals: ToolkitGlobalContribution[] = [];

/** Register a context provider that will wrap the app tree. */
export function registerToolkitProvider(contribution: ToolkitProviderContribution): void {
  providers.push(contribution);
  providers.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/** Register a view component for one or more ViewIds. */
export function registerToolkitView(contribution: ToolkitViewContribution): void {
  views.push(contribution);
}

/** Register a global overlay component (modals, FABs). */
export function registerToolkitGlobal(contribution: ToolkitGlobalContribution): void {
  globals.push(contribution);
}

/** Get all registered providers, sorted by order. */
export function getToolkitProviders(): readonly ToolkitProviderContribution[] {
  return providers;
}

/** Find a view contribution for a given ViewId. */
export function getToolkitView(viewId: ViewId): ToolkitViewContribution | undefined {
  return views.find((v) => v.viewIds.includes(viewId));
}

/** Get all registered global overlay components. */
export function getToolkitGlobals(): readonly ToolkitGlobalContribution[] {
  return globals;
}
