# Studio Commands Reference

This document lists all 19 Studio commands available to the AI chatbot when the Studio tab is active.

## Quick Reference Table

| Command | Args | Returns | Purpose |
|---------|------|---------|---------|
| `studio_get_state` | — | Full Studio state snapshot | Query current job state |
| `studio_set_job_meta` | name?, description? | Updated metadata | Set job name/description |
| `studio_add_step` | commandId, args? | step ID | Add command step to canvas |
| `studio_remove_step` | stepId | confirmation | Remove step by ID |
| `studio_set_step_args` | stepId, args | updated args | Update step argument values |
| `studio_add_parallel_group` | — | group ID | Add parallel container node |
| `studio_set_step_condition` | stepId, condition | updated condition | Set JS pre-condition |
| `studio_set_input_bindings` | stepId, bindings | updated bindings | Map args to storage/deliverables |
| `studio_set_output_mappings` | stepId, mappings | updated mappings | Route outputs to storage/deliverables |
| `studio_add_deliverable` | key, label, type, desc? | added info | Declare expected output |
| `studio_remove_deliverable` | index | confirmation | Remove deliverable by index |
| `studio_add_storage` | key, value | added entry | Add storage default pair |
| `studio_remove_storage` | index | confirmation | Remove storage entry by index |
| `studio_save_job` | — | saved job info | Save job to catalog |
| `studio_run_job` | — | run status | Build and execute job |
| `studio_load_job` | jobId | loaded info | Load from catalog into Studio |
| `studio_clear_canvas` | — | confirmation | Reset Studio (clear all) |
| `studio_create_job` | name, desc?, steps, deliv?, storage?, save?, run? | full result | Build complete job in one call |
| `studio_add_trigger` | event, filter?, label?, cron? | trigger ID | Add automated trigger rule |
| `studio_remove_trigger` | triggerId | confirmation | Remove a trigger by ID |

## Detailed Command Reference

### State Queries

#### `studio_get_state`
Returns the current Studio state as a snapshot.

```typescript
// No arguments
studio_get_state()

// Returns:
{
  name: string;
  description: string;
  editingJobId: string | null;
  mode: "serial" | "parallel" | "mixed";
  steps: StudioStep[];
  deliverables: JobDeliverable[];
  storageEntries: Array<{ key: string; value: string }>;
}
```

**Use case:** Check what's currently in the Studio before making changes.

---

### Job Metadata

#### `studio_set_job_meta`
Set or update the job's name and/or description.

```typescript
studio_set_job_meta({
  name?: string;      // Optional: new job name
  description?: string; // Optional: new job description
})

// Returns:
{ name: string; description: string; }
```

**Use case:** Change the job name or description after creating steps.

---

### Step Management

#### `studio_add_step`
Add a new step to the Studio canvas for a given command.

```typescript
studio_add_step({
  commandId: string;       // Required: ID of the command (e.g., "create_agent")
  args?: Record<string, any>; // Optional: initial argument values
})

// Returns:
{ stepId: string; commandId: string; }
```

**Use case:** Build a job step-by-step, adding commands in sequence.

**Example:**
```typescript
studio_add_step({
  commandId: "create_network",
  args: { name: "Production", description: "Main network" }
})
// Returns: { stepId: "step-1702...", commandId: "create_network" }
```

---

#### `studio_remove_step`
Remove a step from the canvas by ID. Children are reparented to the removed step's parent.

```typescript
studio_remove_step({
  stepId: string; // ID of the step to remove
})

// Returns:
{ removed: string; } // Echoes the removed step ID
```

**Use case:** Remove a step you added by mistake.

---

#### `studio_set_step_args`
Update one or more argument values on a step.

```typescript
studio_set_step_args({
  stepId: string;
  args: Record<string, any>; // Key-value pairs of args to update
})

// Returns:
{ stepId: string; updatedArgs: Record<string, any>; }
```

**Example:**
```typescript
studio_set_step_args({
  stepId: "step-abc123",
  args: { name: "NewNetwork", threshold: 2 }
})
```

---

#### `studio_add_parallel_group`
Add a parallel container node to the canvas. Steps added as children of this group run concurrently.

```typescript
studio_add_parallel_group()

// Returns:
{ groupId: string; } // The new parallel group step ID
```

**Use case:** Group steps that should run in parallel within an otherwise serial job.

---

#### `studio_set_step_condition`
Set a JavaScript pre-condition on a step. The step only executes if the condition evaluates to truthy.

```typescript
studio_set_step_condition({
  stepId: string;
  condition: string; // JavaScript expression
})

// Returns:
{ stepId: string; condition: string; }
```

**Example:**
```typescript
studio_set_step_condition({
  stepId: "step-xyz",
  condition: "$storage.agentCount > 0"
})
```

This step will only run if `agentCount` in storage is greater than 0.

---

### Data Flow

#### `studio_set_input_bindings`
Map step arguments to data from shared storage or deliverables. This allows a step to read data written by previous steps.

```typescript
studio_set_input_bindings({
  stepId: string;
  bindings: Record<string, InputBinding>; // { argName: { source, sourceKey }, ... }
})

// InputBinding format:
// { source: "storage" | "deliverable"; sourceKey: string; }

// Returns:
{ stepId: string; bindings: Record<string, InputBinding>; }
```

**Example:**
```typescript
studio_set_input_bindings({
  stepId: "step-create-agent",
  bindings: {
    networkId: { source: "storage", sourceKey: "network_MainNet" },
    name: { source: "storage", sourceKey: "agentName" }
  }
})
```

Now this step's `networkId` arg will be filled from `$storage.network_MainNet` at runtime.

---

#### `studio_set_output_mappings`
Route step outputs to shared storage or deliverables. This allows subsequent steps to use outputs from earlier steps.

```typescript
studio_set_output_mappings({
  stepId: string;
  mappings: OutputMapping[]; // Array of output routing specs
})

// OutputMapping format:
// { outputKey: string; target: "storage" | "deliverable"; targetKey: string; }
// Use outputKey: "*" to capture the entire output object

// Returns:
{ stepId: string; mappings: OutputMapping[]; }
```

**Example:**
```typescript
studio_set_output_mappings({
  stepId: "step-create-network",
  mappings: [
    {
      outputKey: "id",
      target: "storage",
      targetKey: "network_MainNet"
    },
    {
      outputKey: "*",
      target: "deliverable",
      targetKey: "network_config"
    }
  ]
})
```

This routes the network ID to storage AND the entire output to a deliverable.

---

### Deliverables

#### `studio_add_deliverable`
Declare a deliverable — an expected output the job will produce.

```typescript
studio_add_deliverable({
  key: string;        // Unique key (used in output mappings)
  label: string;      // Display name
  type?: string;      // Type: markdown | json | yaml | csv | image | code (default: "json")
  description?: string; // Optional description
})

// Returns:
{ key: string; label: string; type: string; }
```

**Example:**
```typescript
studio_add_deliverable({
  key: "deployment_report",
  label: "Deployment Report",
  type: "markdown",
  description: "Final report of deployment status and results"
})
```

---

#### `studio_remove_deliverable`
Remove a deliverable by its index (0-based).

```typescript
studio_remove_deliverable({
  index: number; // 0-based index
})

// Returns:
{ removed: number; }
```

---

### Storage

#### `studio_add_storage`
Add a default key-value pair to the job's shared storage. Storage provides inter-step data passing.

```typescript
studio_add_storage({
  key: string;   // Storage key name
  value?: string; // Default value (string or JSON)
})

// Returns:
{ key: string; value: string; }
```

**Example:**
```typescript
studio_add_storage({
  key: "deployment_config",
  value: '{"version": "1.0", "environment": "staging"}'
})
```

---

#### `studio_remove_storage`
Remove a storage entry by index.

```typescript
studio_remove_storage({
  index: number;
})

// Returns:
{ removed: number; }
```

---

### Job Lifecycle

#### `studio_save_job`
Save the current Studio job to the catalog.

```typescript
studio_save_job()

// Returns:
{ saved: true; id: string; name: string; }
```

**Prerequisites:** Job must have a name and at least one step.

---

#### `studio_run_job`
Build the current Studio job and submit it for execution.

```typescript
studio_run_job()

// Returns:
{ running: true; id: string; name: string; stepCount: number; }
```

**Prerequisites:** Job must have a name and at least one step.

---

#### `studio_load_job`
Load a saved job definition from the catalog into the Studio canvas.

```typescript
studio_load_job({
  jobId: string; // ID of the saved job definition
})

// Returns:
{ loaded: true; id: string; name: string; }
```

**Use case:** Load a previously saved job to edit or re-run it.

---

#### `studio_clear_canvas`
Clear the Studio canvas — removes all steps, deliverables, storage, and resets the job name/description.

```typescript
studio_clear_canvas()

// Returns:
{ cleared: true; }
```

---

### Compound Operations

#### `studio_create_job`
Create a complete job in the Studio in one call. Optionally save and/or run immediately.

```typescript
studio_create_job({
  name: string;           // Required: job name
  description?: string;   // Optional: job description
  steps: StepDef[];       // Required: array of step definitions
  deliverables?: DelivDef[]; // Optional: deliverables
  storageDefaults?: Record<string, any>; // Optional: storage defaults
  save?: boolean;         // Optional: save to catalog after creation
  run?: boolean;          // Optional: run after creation
})

// StepDef format:
{
  commandId: string;
  args?: Record<string, any>;
  inputBindings?: Record<string, InputBinding>;
  outputMappings?: OutputMapping[];
  flowType?: "serial" | "parallel";
  condition?: string;
}

// DelivDef format:
{
  key: string;
  label: string;
  type?: string;
  description?: string;
}

// Returns:
{
  name: string;
  stepCount: number;
  stepIds: string[];
  saved?: { ... };  // If save: true
  ran?: { ... };    // If run: true
}
```

**Example:**
```typescript
studio_create_job({
  name: "Deploy Network",
  description: "Create network and agents",
  steps: [
    {
      commandId: "create_network",
      args: { name: "Prod", description: "Production" }
    },
    {
      commandId: "create_agent",
      args: { name: "Manager", role: "admin" },
      inputBindings: {
        networkId: { source: "storage", sourceKey: "network_Prod" }
      }
    }
  ],
  deliverables: [
    {
      key: "network_info",
      label: "Network Info",
      type: "json",
      description: "Final network configuration"
    }
  ],
  storageDefaults: {
    deploymentTime: "2024-01-01T00:00:00Z"
  },
  save: true,
  run: true
})
```

**Use case:** Quickly create a complete, production-ready job in a single AI interaction.

---

## Error Handling

All Studio commands return structured responses. Common errors:

| Scenario | Response |
|----------|----------|
| Studio tab not open | `{ error: "Studio is not available. Navigate to the Studio tab first." }` |
| Invalid commandId | `{ error: "Command \"xxx\" not found in registry." }` |
| Job can't be built (no name) | `{ error: "Cannot build job — ensure name and at least one step exist." }` |
| Job definition not found | `{ error: "Job definition \"xxx\" not found in catalog." }` |

---

## AI Usage Guidelines

1. **For Quick Jobs**: Use `studio_create_job()` with all parameters at once
2. **For Complex Jobs**: Use incremental commands:
   - `studio_add_step()` multiple times
   - `studio_set_step_args()` to configure each
   - `studio_set_input_bindings()` for data flow
   - `studio_set_output_mappings()` for outputs
   - `studio_save_job()` when done

3. **For Editing Existing Jobs**: Use `studio_load_job()` first, then modify
4. **Always Check State**: Use `studio_get_state()` before making assumptions
5. **Explain to User**: Tell the user what you're doing in the Studio before executing

---

## Integration with Other Commands

Studio commands work seamlessly with other workspace commands:

- **Job Queue**: `studio_run_job()` queues the job, visible in `list_queued_jobs`
- **Job Catalog**: `studio_save_job()` saves to the same catalog as `save_job_definition`
- **Command Registry**: `studio_add_step()` accepts any registered command ID
- **Storage**: Studio storage is local to the job; different from workspace-level storage

---

## Example Conversations

### Conversation 1: "Deploy a network"

```
User: "Let me deploy a 3-agent network with messaging"

AI: I'll create a deployment job in the Studio. 
    [Executes: studio_create_job with create_network, 3x create_agent, 2x create_channel steps]
    Created job "Deploy Network" with 6 steps. Running now...
    
    [Job executes in background]
    
    Your network is deployed! The network ID is stored in storage.lastNetworkId.
    You can load the job again later using its ID if needed.
```

### Conversation 2: "Build a data pipeline"

```
User: "Create a job that exports data, transforms it, and archives it"

AI: [Step 1] Creating job "Data Pipeline"
    [Step 2] Adding export_data step
    [Step 3] Adding transform_data step with binding to export output
    [Step 4] Adding archive_data step
    [Step 5] Setting up output mappings to storage
    [Step 6] Saving the job
    
    Ready! The job is saved. Would you like me to run it now?

User: "Yes, run it"

AI: Running Data Pipeline... 
    [Studio jobs: 1] Processing...
    Completed! Results in storage and deliverables.
```

### Conversation 3: "Modify an existing job"

```
User: "Load my 'Deploy Network' job and add a check step after the first agent"

AI: Loading "Deploy Network"... [23 steps loaded]
    Adding studio_check_agent step after create_agent_1
    New step ID: step-1702...
    Saving updated job...
    Done! Job now has 24 steps. Ready to run?
```

---

## Limitations & Future Work

**Current Limitations:**
- Can't directly inspect step-specific details (only full canvas state)
- No built-in job scheduling (only run now)
- Can't edit existing steps (must remove and re-add)

**Future Enhancements:**
- `studio_get_step(stepId)` — Get individual step details
- `studio_schedule_job(time, repeat)` — Schedule job execution
- `studio_update_step(stepId, changes)` — Edit existing step
- `studio_clone_job(jobId, newName)` — Duplicate existing job
- `studio_diff_jobs(jobId1, jobId2)` — Compare two jobs
- `studio_validate_job()` — Pre-flight checks before running
