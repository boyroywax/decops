/**
 * Unified chat turn runner.
 *
 * One function — `runChatTurn` — drives every LLM interaction in the app:
 * direct agent chat, workspace chat (streaming + non-streaming), specialized
 * bots (libp2p, studio), and anything else that needs a tool-use loop.
 *
 * Why a single runner?
 *
 * Before this module existed there were FIVE near-identical implementations
 * of the same loop (`chatWithAgent`, `chatWithWorkspace`,
 * `streamChatWithWorkspace`, `handleLibp2pBotRequest`,
 * `handleStudioBotRequest`). Each diverged subtly in error handling,
 * provider support, max-round limits, and how tool calls were surfaced to
 * the UI. Consolidating that logic here means:
 *
 *  • Streaming + non-streaming follow the same code path. Anthropic streams
 *    SSE; every other provider falls through to a single-shot request and
 *    emits its final text as a synthetic token burst so the UI's live
 *    typing indicator works uniformly.
 *  • Tool calls always go through `executeToolCall` (which queues a Job),
 *    so the same UI cards (`ToolCallCard`, `JobProgressCard`) light up
 *    no matter which surface initiated the call.
 *  • Callers describe what they want — model, system prompt, messages,
 *    tools, callbacks — and the runner handles the loop, error recovery,
 *    and abort semantics.
 *
 * The runner is provider-aware but UI-agnostic. UI integration happens via
 * the `ChatRunCallbacks` interface.
 */

import type { CommandContext } from "@/services/commands/types";
import { executeToolCall } from "@/services/commands/tools";
import type { AnthropicTool } from "@/services/commands/tools";
import type { ToolCallDisplay } from "./chat";
import {
  ANTHROPIC_API_URL,
  getModelProvider, getApiKey, buildHeaders,
  buildProviderRequest, parseProviderResponse,
  parseToolUseBlocks, buildToolResultMessages,
} from "./providers";
import type { ToolUseBlock, ProviderMessage } from "./providers";
import { parseAnthropicSSE, parseOpenAISSE } from "./sse";
import { perfLog, perfNow } from "@/services/perf";

// ── Public types ──────────────────────────────────────────────────────────

export interface ChatRunCallbacks {
  /** Fired for each text token. Non-streaming providers emit synthetic
   *  chunks so UI surfaces can still render progressive output. */
  onToken?: (token: string) => void;
  /** Fired when the model starts a tool call. `input` is empty during the
   *  streaming `content_block_start` event; the populated version arrives
   *  again via `onToolCallStart` immediately before execution.
   *  `opts.textOffset` (when present) is the assistant-text length at
   *  the moment the tool call began streaming, used by the UI for
   *  chronological inline rendering. */
  onToolCallStart?: (
    name: string,
    input: Record<string, unknown>,
    opts?: { textOffset?: number },
  ) => void;
  /** Fired when a tool call completes (success or error). Includes any
   *  `jobId` the command spawned so the chat can render a JobProgressCard. */
  onToolCallComplete?: (display: ToolCallDisplay) => void;
  /** Fired once per round AFTER any tool calls have completed and BEFORE
   *  the next provider request. Useful for UI "thinking" indicators that
   *  want to show a phase transition between tool execution and the next
   *  model response. */
  onRoundEnd?: (round: number) => void;
  /** Pre-execution hook. Return a synthetic result to skip the real tool
   *  call (e.g. for identity guards or permission gates). Return null/
   *  undefined to proceed normally. */
  interceptToolCall?: (
    name: string,
    input: Record<string, unknown>,
  ) => { content: string; isError?: boolean; result?: unknown; error?: string } | null | undefined;
  /** Abort the run. Both the SSE reader and the in-flight fetch are
   *  cancelled. The runner returns whatever text + tool calls accumulated
   *  so far. */
  signal?: AbortSignal;
}

export interface ChatRunOptions {
  model: string;
  systemPrompt: string;
  /** Pre-built message array (provider-agnostic — Anthropic shape). */
  messages: ChatTurnMessage[];
  /** Anthropic-style tool schemas. Empty/undefined means "no tools". */
  tools?: AnthropicTool[];
  /** Command context. Required if `tools` is non-empty. */
  commandContext?: CommandContext;
  /** Default 8. Lower for cheap agents (chatWithAgent uses 6). */
  maxRounds?: number;
  /** Default 4096. */
  maxTokens?: number;
  /** Request the streaming Anthropic transport when the provider supports
   *  it. Non-Anthropic providers always run single-shot regardless. */
  stream?: boolean;
}

/**
 * A message in the chat turn. Anthropic-shaped: content can be a plain
 * string (simple text) or an array of typed content blocks (tool calls,
 * tool results, structured text). Provider adapters translate this into
 * the format their backend expects.
 */
export type ChatTurnMessage = {
  role: "user" | "assistant";
  content: string | ChatContentBlock[];
};

export type ChatContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface ChatRunResult {
  text: string;
  toolCalls: ToolCallDisplay[];
  /** Why the runner returned: a normal completion ("end_turn"), abort,
   *  round-limit, or error. Helpful for debugging chains. */
  reason: "end_turn" | "max_rounds" | "aborted" | "error" | "no_command_context";
  /** Populated when `reason === "error"`. */
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function isMissingKeyError(msg: string): boolean {
  return (
    msg.includes("No Anthropic API key") ||
    msg.includes("No OpenAI API key") ||
    msg.includes("No Google API key") ||
    msg.includes("No OpenRouter API key")
  );
}

function missingKeyMessage(): string {
  return "⚠️ No API key configured. Go to **LLM Manager → Providers** to add your API key.";
}

/** Yield to the event loop so React can flush state updates. */
function microYield(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function emitSyntheticTokenChunks(
  text: string,
  callbacks: ChatRunCallbacks,
): Promise<void> {
  if (!text || !callbacks.onToken) return;

  // Emit the response in a small number of chunks so the UI updates
  // progressively. We yield to the event loop between chunks so React
  // can flush each state update to the DOM — without this, all chunks
  // land in a single microtask and the UI only sees the final state.
  const maxChunks = 16;
  const chunkSize = Math.max(64, Math.ceil(text.length / maxChunks));

  for (let i = 0; i < text.length; i += chunkSize) {
    if (callbacks.signal?.aborted) return;
    callbacks.onToken(text.slice(i, i + chunkSize));
    // Yield so the UI can paint this chunk before the next one arrives.
    await microYield();
  }
}

// ── Main entry point ──────────────────────────────────────────────────────

export async function runChatTurn(
  options: ChatRunOptions,
  callbacks: ChatRunCallbacks = {},
): Promise<ChatRunResult> {
  const turnStart = perfNow();
  const {
    model,
    systemPrompt,
    messages,
    tools,
    commandContext,
    maxRounds = 8,
    maxTokens = 8192,
    stream = false,
  } = options;

  const provider = getModelProvider(model);
  const wantsTools = !!tools && tools.length > 0 && !!commandContext;
  const supportsAnthropicStream = stream && provider === "anthropic";
  // OpenAI/OpenRouter always stream via SSE — text tokens arrive immediately
  // and tool_call deltas are parsed from the stream too.
  const supportsOpenAIStream = stream && (provider === "openai" || provider === "openrouter");

  // Mutable working state.
  const apiMessages: ProviderMessage[] = [...messages];
  const allToolCalls: ToolCallDisplay[] = [];
  let fullText = "";

  // No anti-fabrication / no-progress / self-doubt regex retries here.
  // We trust the model and the provider's own stop signals. The prompt
  // and tool descriptions guide behavior; runtime guardrails were
  // brittle and added more confusion than they prevented.


  try {
    for (let round = 0; round < maxRounds; round++) {
      const roundStart = perfNow();
      let firstTokenMs: number | null = null;
      // Cumulative msg.content length at the start of this round. Each
      // SSE parser reports `textOffset` relative to its own round, but
      // the chat UI splits msg.content (which spans every round) by
      // these offsets — so we add the running base before forwarding to
      // the UI. Without this, every round-2+ tool card collapses to the
      // top of the bubble instead of appearing inline at its true spot.
      const roundTextOffsetBase = fullText.length;
      const roundOnToken = (token: string): void => {
        if (firstTokenMs === null) firstTokenMs = Math.round(perfNow() - roundStart);
        callbacks.onToken?.(token);
      };

      if (callbacks.signal?.aborted) {
        perfLog("ai.run_chat_turn.abort", {
          model,
          provider,
          round,
          totalDurationMs: Math.round(perfNow() - turnStart),
          toolCallCount: allToolCalls.length,
        });
        return { text: fullText, toolCalls: allToolCalls, reason: "aborted" };
      }

      let toolUseBlocks: ToolUseBlock[] = [];
      let rawAssistantContent: unknown = null;
      let roundText = "";
      let finishReason: string | null = null;
      const useStream = supportsAnthropicStream;
      const useOpenAIStream = supportsOpenAIStream;

      // ───── Provider call ─────
      if (useStream) {
        // Anthropic SSE path.
        const body: Record<string, unknown> = {
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: apiMessages,
          stream: true,
        };
        if (wantsTools) {
          body.tools = tools;
          body.tool_choice = { type: "auto" };
        }

        const apiKey = getApiKey();
        const response = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: buildHeaders(apiKey),
          body: JSON.stringify(body),
          signal: callbacks.signal,
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
        }

        const sseResult = await parseAnthropicSSE(
          response,
          {
            onText: (token) => {
              roundText += token;
              roundOnToken(token);
            },
            onToolUseStart: () => { /* execution callback fired later */ },
            onToolUseInput: () => { /* accumulated internally */ },
            onContentBlockStop: () => { /* no-op */ },
            onMessageStop: () => { /* no-op */ },
            onError: (err) => { throw err; },
          },
          callbacks.signal,
        );

        rawAssistantContent = sseResult.contentBlocks;
        toolUseBlocks = sseResult.contentBlocks.filter((b): b is ToolUseBlock => b.type === "tool_use");
        finishReason = sseResult.stopReason ?? null;
      } else {
        // Non-streaming path — works for every provider, including Anthropic
        // when stream:false.
        const req = buildProviderRequest(
          model, systemPrompt, apiMessages, maxTokens,
          wantsTools ? tools : undefined,
        );
        if (useOpenAIStream) {
          // OpenAI/OpenRouter SSE — text-only streaming for tool-less rounds.
          const streamingBody = { ...req.body, stream: true };
          const response = await fetch(req.url, {
            method: "POST",
            headers: req.headers,
            body: JSON.stringify(streamingBody),
            signal: callbacks.signal,
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
          }
          // Collect tool_use blocks that were already streamed via SSE
          // so we don't re-parse them from the final response.
          const streamedToolUseIds = new Set<string>();
          const sseToolUseBlocks: ToolUseBlock[] = [];
          const sse = await parseOpenAISSE(
            response,
            {
              onText: (delta) => {
                roundText += delta;
                roundOnToken(delta);
              },
              onToolUseStart: () => { /* execution callback fired later */ },
              onToolUseInput: () => { /* accumulated internally */ },
            },
            callbacks.signal,
          );
          if (!roundText) roundText = sse.text;
          finishReason = sse.finishReason;
          // Convert streamed OpenAI tool calls to Anthropic-shaped blocks
          // so the rest of the tool-execution loop works unchanged.
          for (const tc of sse.toolCalls) {
            if (tc.id && tc.name) {
              let input: Record<string, unknown> = {};
              try { input = JSON.parse(tc.arguments || "{}"); } catch { /* ignore */ }
              sseToolUseBlocks.push({
                type: "tool_use",
                id: tc.id,
                name: tc.name,
                input,
                textOffset: tc.textOffset,
              });
              streamedToolUseIds.add(tc.id);
            }
          }
          toolUseBlocks = sseToolUseBlocks;
          rawAssistantContent = null;
        } else {
          const response = await fetch(req.url, {
            method: "POST",
            headers: req.headers,
            body: JSON.stringify(req.body),
            signal: callbacks.signal,
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
          }
          const data = await response.json();

          toolUseBlocks = wantsTools ? parseToolUseBlocks(model, data) : [];
          roundText = parseProviderResponse(model, data);
          finishReason = provider === "openai" || provider === "openrouter"
            ? (typeof data?.choices?.[0]?.finish_reason === "string" ? data.choices[0].finish_reason : null)
            : (typeof data?.stop_reason === "string" ? data.stop_reason : null);

          // For the non-streaming path, emit synthetic chunks so the UI can
          // still show progressive typing.
          await emitSyntheticTokenChunks(roundText, callbacks);
          if (roundText && firstTokenMs === null) {
            firstTokenMs = Math.round(perfNow() - roundStart);
          }

          rawAssistantContent = provider === "openai" || provider === "openrouter"
            ? data.choices?.[0]?.message?.tool_calls
            : data.content;
        }
      }

      // ───── No tools requested → done ─────
      if (toolUseBlocks.length === 0) {
        if (roundText) fullText += roundText;
        callbacks.onRoundEnd?.(round);
        perfLog("ai.run_chat_turn.round", {
          model,
          provider,
          round,
          toolUseBlocks: 0,
          roundTextLength: roundText.length,
          firstTokenMs,
          roundDurationMs: Math.round(perfNow() - roundStart),
        });
        perfLog("ai.run_chat_turn.complete", {
          model,
          provider,
          reason: "end_turn",
          roundsUsed: round + 1,
          toolCallCount: allToolCalls.length,
          totalDurationMs: Math.round(perfNow() - turnStart),
        });
        return {
          text: fullText,
          toolCalls: allToolCalls,
          reason: "end_turn",
        };
      }

      // ───── Execute tools ─────
      if (!commandContext) {
        perfLog("ai.run_chat_turn.complete", {
          model,
          provider,
          reason: "no_command_context",
          roundsUsed: round + 1,
          toolCallCount: allToolCalls.length,
          totalDurationMs: Math.round(perfNow() - turnStart),
        });
        // Defensive: the model asked for tools but we have no context.
        return {
          text: fullText || "[No command context available]",
          toolCalls: allToolCalls,
          reason: "no_command_context",
        };
      }

      // For the SSE path the assistant message was the content_blocks the
      // model emitted; for the single-shot path we use the raw provider
      // payload. Either way `buildToolResultMessages` knows how to wrap it.
      const assistantForResults = useStream ? rawAssistantContent : rawAssistantContent;

      if (useStream) {
        // Anthropic SSE round → append assistant content blocks directly so
        // the tool_use_ids match. Sanitize:
        //   1. Drop sparse/undefined entries — native thinking blocks
        //      leave holes in `contentBlocks` because we don't echo them
        //      back (we lack the `signature` field).
        //   2. Drop empty text blocks. Anthropic rejects assistant content
        //      that includes a text block with empty/whitespace-only text
        //      alongside tool_use, with a "text content blocks must be
        //      non-empty" 400. This is the most common cause of the
        //      "response stops after first tool call" symptom.
        //   3. Strip our internal `textOffset` field from tool_use blocks
        //      so the API only sees its own schema.
        const sanitized = Array.isArray(assistantForResults)
          ? (assistantForResults as Array<Record<string, unknown> | undefined>)
              .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
              .map((b) => {
                if (b.type === "tool_use") {
                  const { textOffset: _omit, ...rest } = b as { textOffset?: number } & Record<string, unknown>;
                  return rest;
                }
                return b;
              })
              .filter((b) => {
                if (b.type === "text") {
                  const t = typeof b.text === "string" ? b.text : "";
                  return t.length > 0 && t.trim().length > 0;
                }
                return true;
              })
          : assistantForResults;
        apiMessages.push({ role: "assistant", content: sanitized });
      }

      if (roundText) fullText += roundText;

      // Rebase each tool_use's textOffset onto the cumulative msg.content
      // length so the chat bubble can place it inline at the true position
      // across multi-round turns.
      for (const block of toolUseBlocks) {
        if (typeof block.textOffset === "number") {
          block.textOffset = block.textOffset + roundTextOffsetBase;
        }
      }

      // Execute all tool calls in this round concurrently. Each call is
      // already serialized internally through the job queue, so running
      // them in parallel here only overlaps provider-bound waits and
      // independent commands — it does not break job ordering semantics.
      const toolResults: { id: string; content: string; isError?: boolean }[] = new Array(toolUseBlocks.length);
      await Promise.all(toolUseBlocks.map(async (block, index) => {
        callbacks.onToolCallStart?.(block.name, block.input || {}, { textOffset: block.textOffset });

        // Redundancy guardrail: list_available_commands is fallback-only.
        // The first call within a turn is allowed; subsequent calls in the
        // same turn are short-circuited with a synthetic tool_result that
        // redirects the model to the workspace RAG. This prevents the
        // model from spinning on the catalog instead of acting.
        const isListAvailableCall = (name: string, input: Record<string, unknown> | undefined): boolean => {
          if (name === "list_available_commands") return true;
          // Catch create_job(commandId="list_available_commands") wrappers.
          if ((name === "create_job" || name === "queue_new_job") && input) {
            if (typeof input.commandId === "string" && input.commandId === "list_available_commands") return true;
            if (Array.isArray((input as { steps?: unknown }).steps)) {
              const steps = (input as { steps: Array<Record<string, unknown>> }).steps;
              if (steps.some(s => typeof s?.commandId === "string" && s.commandId === "list_available_commands")) return true;
            }
          }
          return false;
        };
        const priorListAvailableCount = allToolCalls.filter(
          tc => isListAvailableCall(tc.name, tc.input as Record<string, unknown> | undefined),
        ).length;
        if (isListAvailableCall(block.name, block.input || {}) && priorListAvailableCount >= 1) {
          const redirect = {
            error: "REDIRECT",
            message:
              "list_available_commands has already been called in this turn. Do NOT call it again (directly or via create_job). Use search_workspace_rag with a focused multi-word query (e.g. 'destroy network', 'create channel between agents'). If you already have the command id you need, call create_job with that commandId directly. If you need argument shape, call get_command_schema with the specific commandId.",
          };
          const display: ToolCallDisplay = {
            name: block.name,
            input: block.input || {},
            result: redirect,
            duration_ms: 0,
            textOffset: block.textOffset,
          };
          allToolCalls.push(display);
          callbacks.onToolCallComplete?.(display);
          toolResults[index] = {
            id: block.id,
            content: JSON.stringify(redirect),
            isError: false,
          };
          return;
        }

        const intercept = callbacks.interceptToolCall?.(block.name, block.input || {});
        if (intercept) {
          const display: ToolCallDisplay = {
            name: block.name,
            input: block.input || {},
            result: intercept.result,
            error: intercept.error,
            duration_ms: 0,
            textOffset: block.textOffset,
          };
          allToolCalls.push(display);
          callbacks.onToolCallComplete?.(display);
          toolResults[index] = {
            id: block.id,
            content: intercept.content,
            isError: !!intercept.isError,
          };
          return;
        }

        const result = await executeToolCall(
          block.id,
          block.name,
          block.input || {},
          commandContext,
        );

        const display: ToolCallDisplay = {
          name: result.name,
          input: result.input,
          result: result.result,
          error: result.error,
          duration_ms: result.duration_ms,
          jobId: result.jobId,
          textOffset: block.textOffset,
        };
        allToolCalls.push(display);
        callbacks.onToolCallComplete?.(display);

        toolResults[index] = {
          id: block.id,
          content: result.error
            ? JSON.stringify({ error: result.error })
            : JSON.stringify(result.result ?? { success: true }),
          isError: !!result.error,
        };
      }));

      if (useStream) {
        // SSE path: append the tool_result user message manually (we
        // already pushed the assistant blocks above).
        apiMessages.push({
          role: "user",
          content: toolResults.map((tr) => ({
            type: "tool_result",
            tool_use_id: tr.id,
            content: tr.content,
            ...(tr.isError ? { is_error: true } : {}),
          })),
        });
      } else {
        // Single-shot path: let the provider helper construct both messages
        // (it knows how to wrap OpenAI tool_calls vs Anthropic blocks).
        const resultMsgs = buildToolResultMessages(model, assistantForResults, toolResults);
        apiMessages.push(...resultMsgs);
      }

      // Emit the inter-round separator through the token stream so the
      // chat UI's msg.content stays byte-aligned with `fullText` — every
      // round-2+ tool card relies on cumulative `textOffset`s indexing
      // into msg.content. If we only mutate fullText here, persisted
      // content would gain "\n\n" boundaries the live UI never saw and
      // every offset past round 1 would be off-by-two-per-boundary.
      if (roundText) {
        roundOnToken("\n\n");
        fullText += "\n\n";
      }
      perfLog("ai.run_chat_turn.round", {
        model,
        provider,
        round,
        toolUseBlocks: toolUseBlocks.length,
        roundTextLength: roundText.length,
        firstTokenMs,
        roundDurationMs: Math.round(perfNow() - roundStart),
      });
      callbacks.onRoundEnd?.(round);
      // Loop continues to next round so the model can react to tool results.
    }

    perfLog("ai.run_chat_turn.complete", {
      model,
      provider,
      reason: "max_rounds",
      roundsUsed: maxRounds,
      toolCallCount: allToolCalls.length,
      totalDurationMs: Math.round(perfNow() - turnStart),
    });
    return {
      text: fullText || "[Tool call loop limit reached]",
      toolCalls: allToolCalls,
      reason: "max_rounds",
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      perfLog("ai.run_chat_turn.complete", {
        model,
        provider,
        reason: "aborted",
        toolCallCount: allToolCalls.length,
        totalDurationMs: Math.round(perfNow() - turnStart),
      });
      return { text: fullText || "[Cancelled]", toolCalls: allToolCalls, reason: "aborted" };
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (isMissingKeyError(msg)) {
      perfLog("ai.run_chat_turn.complete", {
        model,
        provider,
        reason: "error",
        error: msg,
        toolCallCount: allToolCalls.length,
        totalDurationMs: Math.round(perfNow() - turnStart),
      });
      return { text: missingKeyMessage(), toolCalls: allToolCalls, reason: "error", error: msg };
    }
    perfLog("ai.run_chat_turn.complete", {
      model,
      provider,
      reason: "error",
      error: msg,
      toolCallCount: allToolCalls.length,
      totalDurationMs: Math.round(perfNow() - turnStart),
    });
    // Surface the error to the user even when earlier rounds already
    // produced text. Returning `fullText || error_msg` silently dropped
    // the error whenever round 1 had emitted output, making mid-loop API
    // failures look like the model just stopped responding.
    const visibleError = `\n\n[Chat error: ${msg}]`;
    return {
      text: fullText ? `${fullText}${visibleError}` : `[Chat error: ${msg}]`,
      toolCalls: allToolCalls,
      reason: "error",
      error: msg,
    };
  }
}
