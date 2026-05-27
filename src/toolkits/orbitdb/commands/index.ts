/**
 * OrbitDB toolkit commands — aggregator.
 *
 * Commands wrap the orbitdbService manager so they can be invoked from
 * chat / job pipelines as well as from the UI. Every node-scoped command
 * accepts an optional `nodeId` arg defaulting to the active orbitdb node.
 *
 * Per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md the individual command
 * definitions live in domain-scoped files; this file only re-exports them
 * and assembles the registration array consumed by the toolkit module.
 */

import type { CommandDefinition } from "@/services/commands/types";

import {
    orbitdbStartCommand,
    orbitdbStopCommand,
    orbitdbAddNodeCommand,
    orbitdbRemoveNodeCommand,
    orbitdbSetActiveNodeCommand,
    orbitdbRenameNodeCommand,
    orbitdbSetHeliaCommand,
    orbitdbListNodesCommand,
    orbitdbListHeliaNodesCommand,
} from "./lifecycle";
import {
    orbitdbOpenCommand,
    orbitdbCloseCommand,
    orbitdbDropCommand,
    orbitdbListDbsCommand,
    orbitdbGetIdentityCommand,
} from "./databases";
import {
    orbitdbPutCommand,
    orbitdbKvPutCommand,
    orbitdbKvGetCommand,
    orbitdbKvDelCommand,
    orbitdbKvAllCommand,
} from "./kv";
import {
    orbitdbLogAddCommand,
    orbitdbLogIteratorCommand,
    orbitdbLogAllCommand,
} from "./log";
import {
    orbitdbDocPutCommand,
    orbitdbDocGetCommand,
    orbitdbDocDelCommand,
    orbitdbDocQueryCommand,
    orbitdbDocAllCommand,
} from "./docs";

export {
    orbitdbStartCommand,
    orbitdbStopCommand,
    orbitdbAddNodeCommand,
    orbitdbRemoveNodeCommand,
    orbitdbSetActiveNodeCommand,
    orbitdbRenameNodeCommand,
    orbitdbSetHeliaCommand,
    orbitdbListNodesCommand,
    orbitdbListHeliaNodesCommand,
} from "./lifecycle";
export {
    orbitdbOpenCommand,
    orbitdbCloseCommand,
    orbitdbDropCommand,
    orbitdbListDbsCommand,
    orbitdbGetIdentityCommand,
} from "./databases";
export {
    orbitdbPutCommand,
    orbitdbKvPutCommand,
    orbitdbKvGetCommand,
    orbitdbKvDelCommand,
    orbitdbKvAllCommand,
} from "./kv";
export {
    orbitdbLogAddCommand,
    orbitdbLogIteratorCommand,
    orbitdbLogAllCommand,
} from "./log";
export {
    orbitdbDocPutCommand,
    orbitdbDocGetCommand,
    orbitdbDocDelCommand,
    orbitdbDocQueryCommand,
    orbitdbDocAllCommand,
} from "./docs";

export const orbitdbCommands: CommandDefinition[] = [
    orbitdbStartCommand,
    orbitdbStopCommand,
    orbitdbAddNodeCommand,
    orbitdbRemoveNodeCommand,
    orbitdbSetActiveNodeCommand,
    orbitdbRenameNodeCommand,
    orbitdbSetHeliaCommand,
    orbitdbListNodesCommand,
    orbitdbListHeliaNodesCommand,
    orbitdbOpenCommand,
    orbitdbCloseCommand,
    orbitdbDropCommand,
    orbitdbListDbsCommand,
    orbitdbGetIdentityCommand,
    orbitdbPutCommand,
    orbitdbKvPutCommand,
    orbitdbKvGetCommand,
    orbitdbKvDelCommand,
    orbitdbKvAllCommand,
    orbitdbLogAddCommand,
    orbitdbLogIteratorCommand,
    orbitdbLogAllCommand,
    orbitdbDocPutCommand,
    orbitdbDocGetCommand,
    orbitdbDocDelCommand,
    orbitdbDocQueryCommand,
    orbitdbDocAllCommand,
];
