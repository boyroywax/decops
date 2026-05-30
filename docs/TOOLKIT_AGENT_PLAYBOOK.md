# Toolkit Agent Playbook

This guide is the operator-facing companion to runtime prompt training. It explains when to use each toolkit, how to structure jobs, and how to leverage Workspace RAG safely.

## Core Execution Policy

- Prefer job-first execution for anything beyond one atomic read.
- Use create_job for one command with traceability and queue visibility.
- Use queue_new_job for explicit multi-step plans, dependencies, or parallelism.
- Validate command schema before execution when arguments are uncertain.
- For parallel tasks, use fan-out/fan-in storage patterns to avoid output collisions.

## Workspace RAG Policy

- Use workspace_rag_status before critical actions or historical questions.
- If indexed is false, upToDate is false, or dirty is true, run index_workspace_rag.
- Use search_workspace_rag with focused terms (2-6 words) for retrieval.
- Treat retrieval as supporting context; reconcile with live workspace state before mutation.
- Re-index when retrieval conflicts with known current state.

## Toolkit Guides

### Workspace RAG (workspace-rag)

Use when:
- You need semantic recall for old or indirectly phrased workspace facts.
- A user asks what was decided or configured earlier.

Workflow:
1. workspace_rag_status
2. index_workspace_rag if stale/dirty
3. search_workspace_rag with focused query
4. Build or refine job plan using retrieved evidence

### Jobs (jobs)

Use when:
- Two or more steps are required.
- You need auditability, progress visibility, retry, or cancellation.

Workflow:
1. list_available_commands and get_command_schema
2. create_job for single operations, queue_new_job for composed workflows
3. Add storageDefaults, input bindings, output mappings, deliverables
4. Use step handlers for recovery and notifications

### Agent Management (agent-management)

Use when:
- Creating specialists, updating prompts, or assigning capability boundaries.

Workflow:
1. Define role and target behavior
2. Assign least-privilege toolkit set
3. Wire channels/groups after agent capability is set

### Ecosystem (ecosystem)

Use when:
- Managing networks, bridges, topology, and inter-agent communication paths.

Workflow:
1. Confirm current topology
2. Apply bridge/network changes
3. Re-validate communication and governance relationships

### Infrastructure (infrastructure)

Use when:
- Runtime lifecycle operations or connectivity management are needed.

Workflow:
1. Run read-only probes first
2. Execute state changes in jobs
3. Record durable outcomes in memory/artifacts

### Artifacts (artifacts)

Use when:
- A result should be persisted and referenced later.

Workflow:
1. Declare deliverables up front in jobs
2. Map step outputs to deliverables explicitly
3. Reference artifacts in follow-up jobs by id/tag

### Collective Memory (collective-memory)

Use when:
- Capturing durable decisions, conventions, and preferences.

Workflow:
1. recall_collective_memory before high-stakes planning
2. remember_collective_memory after significant outcomes
3. Keep entries concise, tagged, and self-contained

### Workspace Management (workspace-mgmt)

Use when:
- Creating, switching, exporting, or lifecycle-managing workspaces.

Workflow:
1. Confirm active workspace identity
2. Export before major/destructive changes
3. Perform mutation operations with explicit user intent

### Studio (studio)

Use when:
- The user wants visual job composition, inspection, or automation authoring.

Workflow:
1. Define metadata and steps
2. Configure data flow (inputs/storage/outputs)
3. Add triggers and validate dry-run behavior

## Common Workflow Templates

### Research and Synthesis

1. search_workspace_rag for prior context
2. queue_new_job with parallel research substeps
3. consolidate in a serial synthesis step
4. write final report artifact and memory summary

### Topology Change

1. workspace_rag_status + search_workspace_rag for prior constraints
2. queue_new_job with validation step -> topology mutation step -> verification step
3. remember_collective_memory for durable topology decisions

### Incident Triage

1. Run read-only diagnostics in a job
2. Use Workspace RAG to pull related historical runs
3. Execute corrective actions in controlled serial steps
4. Produce artifact + memory entry with incident resolution
