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
import { parseAnthropicSSE } from "./sse";

// ── Public types ──────────────────────────────────────────────────────────

export interface ChatRunCallbacks {
  /** Fired for each text token. Non-streaming providers emit the full
   *  message as a single burst at the end of the round. */
  onToken?: (token: string) => void;
  /** Fired when the model starts a tool call. `input` is empty during the
   *  streaming `content_block_start` event; the populated version arrives
   *  again via `onToolCallStart` immediately before execution. */
  onToolCallStart?: (name: string, input: Record<string, unknown>) => void;
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

// ── Main entry point ──────────────────────────────────────────────────────

export async function runChatTurn(
  options: ChatRunOptions,
  callbacks: ChatRunCallbacks = {},
): Promise<ChatRunResult> {
  const {
    model,
    systemPrompt,
    messages,
    tools,
    commandContext,
    maxRounds = 8,
    maxTokens = 4096,
    stream = false,
  } = options;

  const provider = getModelProvider(model);
  const wantsTools = !!tools && tools.length > 0 && !!commandContext;
  const useStream = stream && provider === "anthropic";

  // Mutable working state.
  const apiMessages: ProviderMessage[] = [...messages];
  const allToolCalls: ToolCallDisplay[] = [];
  let fullText = "";

  try {
    for (let round = 0; round < maxRounds; round++) {
      if (callbacks.signal?.aborted) {
        return { text: fullText, toolCalls: allToolCalls, reason: "aborted" };
      }

      let toolUseBlocks: ToolUseBlock[] = [];
      let rawAssistantContent: unknown = null;
      let roundText = "";

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
              callbacks.onToken?.(token);
            },
            onToolUseStart: (block) => {
              callbacks.onToolCallStart?.(block.name, {});
            },
            onToolUseInput: () => { /* accumulated internally */ },
            onContentBlockStop: () => { /* no-op */ },
            onMessageStop: () => { /* no-op */ },
            onError: (err) => { throw err; },
          },
          callbacks.signal,
        );

        rawAssistantContent = sseResult.contentBlocks;
        toolUseBlocks = sseResult.contentBlocks.filter((b): b is ToolUseBlock => b.type === "tool_use");
      } else {
        // Non-streaming path — works for every provider, including Anthropic
        // when stream:false.
        const req = buildProviderRequest(
          model, systemPrompt, apiMessages, maxTokens,
          wantsTools ? tools : undefined,
        );
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

        // For the non-streaming path, surface the response as a single
        // "token" so UI consumers don't need a separate code path.
        if (roundText && callbacks.onToken) callbacks.onToken(roundText);

        rawAssistantContent = provider === "openai" || provider === "openrouter"
          ? data.choices?.[0]?.message?.tool_calls
          : data.content;
      }

      fullText += roundText;

      // ───── No tools requested → done ─────
      if (toolUseBlocks.length === 0) {
        callbacks.onRoundEnd?.(round);
        return {
          text: fullText || "[No response]",
          toolCalls: allToolCalls,
          reason: "end_turn",
        };
      }

      // ───── Execute tools ─────
      if (!commandContext) {
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
        // the tool_use_ids match.
        apiMessages.push({ role: "assistant", content: assistantForResults });
      }

      const toolResults: { id: string; content: string; isError?: boolean }[] = [];
      for (const block of toolUseBlocks) {
        callbacks.onToolCallStart?.(block.name, block.input || {});

        // Bot/caller intercept — short-circuit specific tools (identity
        // guards, permission gates, etc.).
        const intercept = callbacks.interceptToolCall?.(block.name, block.input || {});
        if (intercept) {
          const display: ToolCallDisplay = {
            name: block.name,
            input: block.input || {},
            result: intercept.result,
            error: intercept.error,
            duration_ms: 0,
          };
          allToolCalls.push(display);
          callbacks.onToolCallComplete?.(display);
          toolResults.push({
            id: block.id,
            content: intercept.content,
            isError: !!intercept.isError,
          });
          continue;
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
        };
        allToolCalls.push(display);
        callbacks.onToolCallComplete?.(display);

        toolResults.push({
          id: block.id,
          content: result.error
            ? JSON.stringify({ error: result.error })
            : JSON.stringify(result.result ?? { success: true }),
          isError: !!result.error,
        });
      }

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

      if (roundText) fullText += "\n\n";
      callbacks.onRoundEnd?.(round);
      // Loop continues to next round so the model can react to tool results.
    }

    return {
      text: fullText || "[Tool call loop limit reached]",
      toolCalls: allToolCalls,
      reason: "max_rounds",
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { text: fullText || "[Cancelled]", toolCalls: allToolCalls, reason: "aborted" };
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (isMissingKeyError(msg)) {
      return { text: missingKeyMessage(), toolCalls: allToolCalls, reason: "error", error: msg };
    }
    return {
      text: fullText || `[Chat error: ${msg}]`,
      toolCalls: allToolCalls,
      reason: "error",
      error: msg,
    };
  }
}
