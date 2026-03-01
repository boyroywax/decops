/**
 * Command Error Index
 *
 * Standardised catalogue of potential errors for each command.
 * Used by CommandCardModal to display likely failure modes.
 */

export interface CommandError {
  message: string;
  /** What triggers this error */
  cause: string;
}

export const COMMAND_ERRORS: Record<string, CommandError[]> = {
  // ── Agent ────────────────
  create_agent: [
    { message: "Name must be at least 3 characters", cause: "Validation: name too short" },
    { message: "Invalid role", cause: "Role not in allowed list" },
  ],
  ping_agent: [
    { message: "Agent {id} not found", cause: "Agent ID doesn't exist in workspace" },
    { message: "Agent {name} is unresponsive (timeout)", cause: "Agent failed to respond within timeout window" },
  ],
  delete_agent: [
    { message: "Agent {id} not found", cause: "Agent ID doesn't exist in workspace" },
  ],
  update_agent_prompt: [],

  // ── Channel ──────────────
  create_channel: [
    { message: "Agent '{from}' not found", cause: "Source agent ID/name doesn't exist" },
    { message: "Agent '{to}' not found", cause: "Target agent ID/name doesn't exist" },
    { message: "Cannot create channel to self", cause: "Both endpoints resolve to the same agent" },
  ],
  delete_channel: [],
  edit_channel: [],

  // ── Group ────────────────
  create_group: [
    { message: "Agent '{input}' not found", cause: "A member ID/name doesn't exist" },
    { message: "Group must have at least 2 members", cause: "Fewer than 2 valid members provided" },
  ],
  delete_group: [],
  toggle_group_member: [],

  // ── Messaging ────────────
  send_message: [
    { message: "Sender agent '{id}' not found", cause: "from_agent_id doesn't exist" },
    { message: "Recipient agent '{id}' not found", cause: "to_agent_id doesn't exist" },
    { message: "No channel exists between {from} and {to}", cause: "No channel connecting sender and recipient" },
  ],
  broadcast_message: [
    { message: "Group not found", cause: "group_id doesn't exist" },
    { message: "Group needs at least 2 members", cause: "Group has fewer than 2 members" },
    { message: "Sender not found", cause: "sender_id doesn't exist" },
  ],

  // ── Ecosystem / Network ──
  create_network: [],
  list_networks: [],
  update_network: [
    { message: "Network {id} not found", cause: "Network ID doesn't exist" },
    { message: "No update fields provided", cause: "Must specify name, description, or color" },
  ],
  destroy_network: [
    { message: "Network {id} not found in ecosystem", cause: "Network ID doesn't exist" },
  ],
  load_ecosystem: [
    { message: "Network not found in ecosystem", cause: "Network ID doesn't exist" },
  ],

  // ── Architect ────────────
  prompt_architect: [],
  deploy_network: [
    { message: "No config or prompt provided", cause: "Neither prompt arg nor stored config available" },
  ],

  // ── Image Generation ─────
  generate_image: [
    { message: "No Gemini API key configured", cause: "Missing API key in Profile & Settings" },
    { message: "entityId is required for agent_portrait target", cause: "target=agent_portrait but no entityId" },
    { message: "Agent not found: {id}", cause: "entityId doesn't match any agent" },
    { message: "entityId is required for group_badge target", cause: "target=group_badge but no entityId" },
    { message: "Group not found: {id}", cause: "entityId doesn't match any group" },
    { message: "prompt is required for custom target", cause: "target=custom but no prompt" },
  ],
  generate_all_images: [
    { message: "No Gemini API key configured", cause: "Missing API key in Profile & Settings" },
  ],
  generate_icon: [
    { message: "No Gemini API key configured", cause: "Missing API key in Profile & Settings" },
  ],

  // ── Topology ─────────────
  create_bridge: [
    { message: "Bridge already exists", cause: "Duplicate bridge between same networks" },
  ],
  delete_bridge: [],
  print_topology: [],

  // ── Artifact ─────────────
  create_artifact: [],
  edit_artifact: [
    { message: "Artifact {id} not found", cause: "Artifact ID doesn't exist" },
  ],
  tag_artifact: [
    { message: "Artifact {id} not found", cause: "Artifact ID doesn't exist" },
    { message: "Provide at least one of: add, remove, or set", cause: "No tag operation specified" },
  ],
  delete_artifact: [],
  list_artifacts: [],
  search_artifacts: [
    { message: "Search query cannot be empty", cause: "Empty query string" },
  ],

  // ── Data / Export ────────
  export_full_backup: [],
  export_workspace: [],
  export_data: [
    { message: "Unknown entity type: {type}", cause: "Invalid type argument" },
    { message: "{type} with ID {id} not found", cause: "Entity doesn't exist" },
  ],

  // ── Workspace ────────────
  create_workspace: [
    { message: "Workspace Manager not available", cause: "Feature not initialized" },
  ],
  switch_workspace: [
    { message: "Workspace Manager not available", cause: "Feature not initialized" },
  ],
  delete_workspace: [
    { message: "Workspace Manager not available", cause: "Feature not initialized" },
  ],
  duplicate_workspace: [
    { message: "Workspace Manager not available", cause: "Feature not initialized" },
  ],

  // ── Maintenance ──────────
  reset_workspace: [],
  bulk_delete: [
    { message: "No IDs provided for bulk delete", cause: "Empty ids array" },
    { message: "Unknown type: {type}", cause: "Invalid entity type" },
    { message: "None of the provided IDs were found", cause: "All IDs invalid or missing" },
  ],

  // ── System ───────────────
  set_api_key: [],
  select_ai_model: [],

  // ── Jobs ─────────────────
  queue_new_job: [],
  pause_queue: [],
  resume_queue: [],
  delete_queued_job: [],
  list_queued_jobs: [],
  list_catalog_jobs: [],
  save_job_definition: [],
  delete_job_definition: [],

  // ── Query ────────────────
  list_agents: [],
  list_groups: [],
  list_channels: [],
  list_messages: [],
};

/** Get errors for a command, returning empty array for unknown commands */
export function getCommandErrors(commandId: string): CommandError[] {
  return COMMAND_ERRORS[commandId] ?? [];
}
