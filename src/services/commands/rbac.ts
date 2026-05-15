import type { RoleId } from "@/types";
import type { CommandContext, CommandDefinition } from "./types";

/**
 * Thrown when a caller attempts to execute a command their role is not
 * permitted to invoke (see `CommandDefinition.rbac`).
 *
 * This is a *typed* error so UI surfaces can detect it via `instanceof` and
 * display a permission-denied message rather than a generic failure.
 */
export class RBACDenied extends Error {
    readonly name = "RBACDenied";
    readonly commandId: string;
    readonly actorRole: RoleId;
    readonly allowedRoles: readonly RoleId[];

    constructor(commandId: string, actorRole: RoleId, allowedRoles: readonly RoleId[]) {
        super(
            `Role "${actorRole}" is not permitted to execute command "${commandId}". ` +
            `Allowed roles: ${allowedRoles.join(", ") || "(none)"}.`,
        );
        this.commandId = commandId;
        this.actorRole = actorRole;
        this.allowedRoles = allowedRoles;
    }
}

/**
 * Default actor role used when the auth context has no user (e.g. headless
 * job execution, tests with `user: null`, or the local-first single-user app
 * where the human is implicitly the workspace owner).
 *
 * "orchestrator" mirrors AutomationsContext's system-user convention and is
 * the highest-privilege role; this preserves existing behaviour where every
 * built-in command's `rbac` array includes "orchestrator".
 */
export const DEFAULT_ACTOR_ROLE: RoleId = "orchestrator";

/**
 * Resolve the effective actor role from a command context. Prefers an
 * explicitly-set `auth.user.role`, falls back to {@link DEFAULT_ACTOR_ROLE}.
 *
 * The `User` type does not formally declare a `role` field today
 * (single-user local-first app); this helper duck-types it so future
 * multi-role / multi-tenant work can populate it without further changes.
 */
export function getActorRole(context: Pick<CommandContext, "auth"> | undefined): RoleId {
    const user = context?.auth?.user as { role?: RoleId } | null | undefined;
    return user?.role ?? DEFAULT_ACTOR_ROLE;
}

/**
 * Enforce a command's RBAC list against the current actor's role.
 *
 * - An empty `command.rbac` array is treated as "no restrictions" (any role
 *   may execute) — this matches the pre-enforcement permissive default.
 * - Otherwise the actor's role must appear in `command.rbac` or an
 *   {@link RBACDenied} error is thrown.
 *
 * Side-effect free aside from throwing.
 */
export function assertRBAC(
    command: Pick<CommandDefinition, "id" | "rbac">,
    context: Pick<CommandContext, "auth"> | undefined,
): void {
    const allowed = command.rbac ?? [];
    if (allowed.length === 0) return; // no restrictions declared

    const role = getActorRole(context);
    if (!allowed.includes(role)) {
        throw new RBACDenied(command.id, role, allowed);
    }
}
