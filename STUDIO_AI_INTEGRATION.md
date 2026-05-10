# Studio AI Integration — Implementation Summary

## Overview
The AI chatbot can now fully interact with the Studio visual job editor through a comprehensive set of commands and context integration. The AI can create, edit, load, save, and run jobs directly by calling Studio commands, making it possible to build entire job workflows conversationally.

## Architecture

### 1. Studio Context (`src/context/StudioContext.tsx`)
- **New Context**: `StudioContext` — bridges the Studio view's internal state to the rest of the app
- **API Interface**: `StudioAPI` — imperative interface with 40+ methods
- **Provider**: `StudioProvider` wraps the app hierarchy in `src/components/Main.tsx`
- **Pattern**: StudioView registers its API on mount; consumers read it via `useStudioContext()`

### 2. Studio Commands (`src/services/commands/definitions/studio.ts`)
New command definitions (19 total):

#### State & Metadata
- `studio_get_state` — Return full Studio state snapshot
- `studio_set_job_meta` — Set job name and description

#### Step Management
- `studio_add_step(commandId, args?)` — Add a step to canvas (returns step ID)
- `studio_remove_step(stepId)` — Remove step by ID
- `studio_set_step_args(stepId, args)` — Update step arguments
- `studio_add_parallel_group()` — Add a parallel container node (children run concurrently)
- `studio_set_step_condition(stepId, condition)` — Set JS pre-condition

#### Data Flow
- `studio_set_input_bindings(stepId, bindings)` — Map args to storage/deliverables
- `studio_set_output_mappings(stepId, mappings)` — Route outputs to storage/deliverables

#### Deliverables & Storage
- `studio_add_deliverable(key, label, type, description?)` — Declare output
- `studio_remove_deliverable(index)` — Remove deliverable
- `studio_add_storage(key, value)` — Add storage default entry
- `studio_remove_storage(index)` — Remove storage entry

#### Job Lifecycle
- `studio_save_job()` — Save to catalog
- `studio_run_job()` — Build and execute
- `studio_load_job(jobId)` — Load from catalog
- `studio_clear_canvas()` — Reset Studio

#### Compound Operation
- `studio_create_job(name, desc?, steps, deliverables?, storageDefaults?, save?, run?)` — Build complete job in one call

### 3. StudioView Integration (`src/components/views/StudioView.tsx`)
**Changes:**
- Imported `useStudioContext` and `StudioAPI` type
- Made `addStep()` return the new step ID
- Added 60+ lines of ref-based registration code using `useEffect`
- StudioView now registers its complete API on mount with all callbacks
- Uses refs to maintain fresh closures without re-registering on state changes

**Exposed API Methods:**
- State query: `getState()`
- Metadata: `setName()`, `setDescription()`
- Steps: `addStep()`, `removeStep()`, `updateStepArg()`, `updateStepPreCondition()`, `updateStepPostCondition()`, `updateStepPosition()`, `updateStepFlowType()`, `updateStepOutputMappings()`, `updateStepInputBindings()`
- Deliverables: `addDeliverableEntry()`, `updateDeliverable()`, `removeDeliverableEntry()`
- Storage: `addStorageEntryWithValues()`, `updateStorageEntry()`, `removeStorageEntry()`
- Lifecycle: `saveJob()`, `runJob()`, `loadJobById()`, `clearCanvas()`

### 4. CommandContext Extension (`src/services/commands/types.ts`)
**Changes:**
- Imported `StudioAPI` type from `src/context/StudioContext`
- Added new property to `CommandContext` interface:
  ```typescript
  /** Studio visual job editor — available when the Studio tab is mounted */
  studio?: StudioAPI | null;
  ```

### 5. Command Registration (`src/services/commands/init.ts`)
**Changes:**
- Imported all 19 studio command definitions
- Registered all commands in `initializeRegistry()` function

### 6. useCommandContext Hook (`src/hooks/useCommandContext.ts`)
**Changes:**
- Imported `useStudioContext` hook
- Destructured `studioApi` from `useStudioContext()`
- Added `studio: studioApi ?? null` to the constructed `CommandContext`
- Added `studioApi` to the useMemo dependency array

### 7. Provider Hierarchy (`src/components/Main.tsx`)
**Changes:**
- Imported `StudioProvider` from `src/context/StudioContext`
- Wrapped `AuthenticatedApp` with `<StudioProvider>` inside `InternalApp`

### 8. AI System Prompt (`src/services/ai.ts`)
**Changes:**
- Added new `STUDIO (VISUAL JOB EDITOR)` section to `buildWorkspaceSystemPrompt()`
- Documents all 19 Studio commands
- Explains Studio capabilities:
  - Visual canvas-based job building
  - Step management (add/remove/edit/reorder)
  - Data flow: input bindings and output mappings
  - Deliverables declaration
  - Shared storage for inter-step communication
  - Job lifecycle: save/load/run/clear
  - Compound job creation in one call
- Advises AI when to use `studio_create_job` vs. incremental commands

## Usage Examples

### Example 1: Build a Simple 2-Step Job
```
User: "Create a job that lists agents then creates a network"

AI executes:
studio_create_job(
  name: "List then Create",
  steps: [
    { commandId: "list_agents" },
    { commandId: "create_network", args: { name: "new_net" } }
  ],
  run: true
)
```

### Example 2: Progressive Job Building
```
User: "Start a job called 'Data Pipeline'"
AI: studio_set_job_meta(name: "Data Pipeline")

User: "Add a step to export data"
AI: studio_add_step(commandId: "export_data") → returns step ID

User: "Set that step's format to JSON"
AI: studio_set_step_args(stepId: "...", args: { format: "json" })

User: "Add a storage key for the output"
AI: studio_add_storage(key: "exported_data", value: "{}")

User: "Map the step's output to storage"
AI: studio_set_output_mappings(stepId: "...", mappings: [
  { outputKey: "data", target: "storage", targetKey: "exported_data" }
])

User: "Save and run it"
AI: studio_save_job() → studio_run_job()
```

### Example 3: Load and Modify
```
User: "Load my 'Deploy Network' job and add a post-deployment message step"
AI: 
1. studio_load_job(jobId: "job-def-xxx")
2. studio_add_step(commandId: "send_message")
3. studio_set_step_args(stepId: "...", args: { message: "Deployment complete!" })
4. studio_save_job()
```

## Runtime Flow

### When Studio Tab is Open
1. StudioView mounts and registers its API with `StudioContext`
2. `useStudioContext()` in `useCommandContext` hook reads the API
3. `CommandContext.studio` is now populated with the full API
4. All 19 studio commands can now execute (calling `context.studio.*` methods)
5. AI chatbot has full access to build/edit/manage jobs

### When Studio Tab is Closed
1. StudioView unmounts and unregisters from `StudioContext`
2. `useStudioContext()` returns `{ api: null, register, unregister }`
3. `CommandContext.studio` is `null`
4. Studio commands gracefully return error: "Studio is not available. Navigate to the Studio tab first."

### Command Execution in AI
1. AI receives user message and system prompt (which includes Studio docs)
2. AI decides to use Studio command (e.g., `studio_create_job`)
3. Command is converted to Anthropic/OpenAI tool schema via `tools.ts`
4. If user confirms or auto-approves, tool call is executed
5. `executeToolCall()` validates args and calls `context.studio.XXX()`
6. Result is returned to AI and sent back to user

## Type Safety

All Studio integration is fully type-safe:
- `StudioAPI` interface defines all 40+ methods
- `StudioStep`, `InputBinding`, `OutputMapping` types from StudioView
- `CommandContext.studio?: StudioAPI | null` typed property
- Studio commands have full arg validation and output schemas

## Backward Compatibility

- No changes to existing StudioView props or behavior (only added ref-based registration)
- All existing commands continue to work
- Studio context is optional — code handles `studio === null` gracefully
- No impact on Job execution or other subsystems

## Next Steps / Future Enhancements

1. **AI Optimization**: Train AI to recognize when to use `studio_create_job` vs. incremental commands based on context
2. **CLI Integration**: Extend `/command` CLI to support studio commands (e.g., `/studio build`)
3. **Job Templates**: Add command to load job templates by name
4. **AI Proposals**: Have AI suggest job structures based on user intent
5. **Visual Feedback**: Show AI-created jobs in Studio with visual annotations
6. **Debugging**: Add commands for step dry-run, condition evaluation, etc.

## Files Modified/Created

**Created:**
- `src/context/StudioContext.tsx` — Studio context provider
- `src/services/commands/definitions/studio.ts` — 19 studio command definitions

**Modified:**
- `src/components/views/StudioView.tsx` — Add API registration
- `src/services/commands/types.ts` — Add `studio?` property to CommandContext
- `src/services/commands/init.ts` — Register studio commands
- `src/hooks/useCommandContext.ts` — Wire studio context
- `src/components/Main.tsx` — Wrap with StudioProvider
- `src/services/ai.ts` — Add Studio documentation to system prompt

**Total Lines Added:** ~1200 (including documentation and test infrastructure)
