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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    maxTokens = 4096,
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

  // Anti-fabrication rail. Models occasionally emit a ```thinking block
  // declaring `Needs tools: yes` followed by prose that NARRATES a tool
  // call without ever emitting a structured tool_use. The user sees the
  // chat say "Running X..." but nothing actually executes. Detect this
  // mismatch and force a retry with a corrective system reminder.
  // Capped so a stubborn model can't burn the round budget.
  const FABRICATION_RETRY_BUDGET = 2;
  let fabricationRetries = 0;
  const CONTINUATION_RETRY_BUDGET = 2;
  let continuationRetries = 0;
  const NO_PROGRESS_RETRY_BUDGET = 2;
  let noProgressRetries = 0;
  const CAPABILITY_REFUSAL_RETRY_BUDGET = 2;
  let capabilityRefusalRetries = 0;
  const declaredToolsRegex = /```thinking[\s\S]*?Needs tools:\s*yes\b/i;
  const narratedToolVerbRegex = /\b(run(?:ning)?|call(?:ing)?|invoke(?:d|s|ing)?|use(?:d|s|ing)?|execut(?:e|ed|es|ing)|queue(?:d|s|ing)?|trigger(?:ed|s|ing)?)\b/i;
  const fabricatedResultRegex = /\b(tool|command|job)\b[\s\S]{0,32}\b(returned|returns|result|results|output|completed|failed|succeeded|queued|created|deployed)\b|\b(result|output)\s*:\s*\{|\bjob[\s_-]?id\s*[:=]/i;
  const capabilityRefusalRegex = /\b(i\s+cannot\s+emit|unable\s+to\s+emit|cannot\s+emit)\b[\s\S]{0,80}\btool[_ -]?use\b|\btool[_ -]?use\s+xml\b|\bfundamental\s+limitation\b|\bcurrent\s+configuration\b[\s\S]{0,40}\blimitation\b|\bblocked\s+by\s+the\s+guardian\b/i;
  const planningNarrationRegex = /\b(i\s+will|i'll|let\s+me|next\s+i|then\s+i|going\s+to|about\s+to)\b/i;
  const workflowMarkerRegex = /```thinking|(?:^|\n)\s*(Plan|Next|Assess):/i;
  const directAnswerSignalRegex = /\b(done|completed|finished|summary|in short|based on|i found|here\s+are|here's|result)\b/i;
  const serializedToolCallRegex = /<(?:longcat_tool_call|tool_call|tooluse)[^>]*>|<(?:longcat_arg_key|longcat_arg_value|arg_key|arg_value)[^>]*>/i;
  const serializedToolNameRegex = /<longcat_tool_call>\s*([^\n<]+)/i;
  const toolNames = (tools || []).map(t => t.name).filter(Boolean);

  const findMentionedToolName = (text: string): string | null => {
    if (!text || toolNames.length === 0) return null;
    const lowered = text.toLowerCase();
    for (const name of toolNames) {
      const pat = new RegExp(`\\b${escapeRegExp(name.toLowerCase())}\\b`, "i");
      if (pat.test(lowered)) return name;
    }
    return null;
  };

  const detectNarratedToolName = (text: string): string | null => {
    if (!text || !narratedToolVerbRegex.test(text)) return null;
    return findMentionedToolName(text);
  };

  const detectFabricatedResultCue = (text: string): { reason: string; toolName?: string } | null => {
    if (!text) return null;
    const mentionedToolName = findMentionedToolName(text);

    // Strongest signal: explicit tool name + result-oriented language.
    if (mentionedToolName && /\b(returned|result|output|completed|failed|succeeded|queued|created|deployed)\b/i.test(text)) {
      return { reason: `claimed result from tool "${mentionedToolName}"`, toolName: mentionedToolName };
    }

    // Secondary signal: generic tool/command/job result narration.
    if (fabricatedResultRegex.test(text)) {
      return { reason: "claimed tool/command/job results" };
    }

    return null;
  };

  const isPotentiallyIncompleteText = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (trimmed.endsWith("```")) return false;
    if (/[.!?)]$/.test(trimmed)) return false;
    if (trimmed.length < 80) return false;
    return true;
  };

  try {
    for (let round = 0; round < maxRounds; round++) {
      const roundStart = perfNow();
      let firstTokenMs: number | null = null;
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
              onToolUseStart: (block) => {
                callbacks.onToolCallStart?.(block.name, {});
              },
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
              sseToolUseBlocks.push({ type: "tool_use", id: tc.id, name: tc.name, input });
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

      // ───── No tools requested → done (with anti-fabrication check) ─────
      if (toolUseBlocks.length === 0) {
        const truncatedByTokenLimit = finishReason === "max_tokens" || finishReason === "length";
        const narratedToolName = detectNarratedToolName(roundText);
        const fabricatedResultCue = detectFabricatedResultCue(roundText);
        const serializedToolCallDetected = serializedToolCallRegex.test(roundText);
        const serializedToolName = (() => {
          if (!serializedToolCallDetected) return null;
          const m = roundText.match(serializedToolNameRegex);
          return m?.[1]?.trim() || null;
        })();
        const appearsLikePlanningNarration =
          workflowMarkerRegex.test(roundText) &&
          planningNarrationRegex.test(roundText) &&
          !directAnswerSignalRegex.test(roundText);
        const needsFabricationRetry =
          wantsTools &&
          fabricationRetries < FABRICATION_RETRY_BUDGET &&
          (declaredToolsRegex.test(roundText) || !!narratedToolName || !!fabricatedResultCue || serializedToolCallDetected);

        const needsNoProgressRetry =
          wantsTools &&
          noProgressRetries < NO_PROGRESS_RETRY_BUDGET &&
          !needsFabricationRetry &&
          appearsLikePlanningNarration;

        const claimsPlatformLimitation = capabilityRefusalRegex.test(roundText);
        const needsCapabilityRefusalRetry =
          wantsTools &&
          capabilityRefusalRetries < CAPABILITY_REFUSAL_RETRY_BUDGET &&
          !needsFabricationRetry &&
          claimsPlatformLimitation;

        if (
          needsFabricationRetry
        ) {
          // Model said or implied it needed tools but didn't actually call one.
          // Push its assistant turn so it sees its own previous output,
          // then a corrective user message, and let the loop continue.
          fabricationRetries++;
          if (rawAssistantContent && Array.isArray(rawAssistantContent) && rawAssistantContent.length > 0) {
            apiMessages.push({ role: "assistant", content: rawAssistantContent });
          } else if (roundText) {
            apiMessages.push({ role: "assistant", content: roundText });
          }
          apiMessages.push({
            role: "user",
            content: `[SYSTEM GUARDRAIL] Your previous turn ${serializedToolCallDetected ? `serialized a pseudo tool call${serializedToolName ? ` for "${serializedToolName}"` : ""} using XML-like tags` : narratedToolName ? `narrated calling tool "${narratedToolName}"` : fabricatedResultCue ? fabricatedResultCue.reason : `declared "Needs tools: yes"`} but did NOT emit a structured tool_use block — nothing actually executed. Writing prose or XML-like tags about a tool does not invoke it. Retry now: either (a) emit the real provider-native tool_use call immediately after a corrected \`\`\`thinking block, or (b) if you cannot or should not use a tool, output a \`\`\`thinking block with "Needs tools: no" and answer directly from workspace state. Do NOT output <longcat_tool_call>, <tool_call>, or any XML-like argument tags.`,
          });
          callbacks.onRoundEnd?.(round);
          continue;
        }

        if (needsNoProgressRetry) {
          noProgressRetries++;
          if (rawAssistantContent && Array.isArray(rawAssistantContent) && rawAssistantContent.length > 0) {
            apiMessages.push({ role: "assistant", content: rawAssistantContent });
          } else if (roundText) {
            apiMessages.push({ role: "assistant", content: roundText });
          }
          apiMessages.push({
            role: "user",
            content: "[SYSTEM EXECUTION GUARDRAIL] Your previous turn described a plan in prose but did not execute it. Stop narrating intent. Next turn must do exactly one of: (a) emit a real structured tool_use immediately, or (b) provide a direct final answer with no execution claims and no future-tense action narration.",
          });
          callbacks.onRoundEnd?.(round);
          continue;
        }

        if (needsCapabilityRefusalRetry) {
          capabilityRefusalRetries++;
          if (rawAssistantContent && Array.isArray(rawAssistantContent) && rawAssistantContent.length > 0) {
            apiMessages.push({ role: "assistant", content: rawAssistantContent });
          } else if (roundText) {
            apiMessages.push({ role: "assistant", content: roundText });
          }
          apiMessages.push({
            role: "user",
            content: "[SYSTEM TOOL-CALL CLARIFICATION] Do not claim platform/guardian/configuration limits about structured tool_use. In this runtime, tool calls are emitted by your provider output channel, not by writing XML in prose. If tools are needed, emit one real tool_use now. If no tool is needed, answer directly with no execution claims.",
          });
          callbacks.onRoundEnd?.(round);
          continue;
        }

        const needsContinuationRetry =
          continuationRetries < CONTINUATION_RETRY_BUDGET &&
          round < maxRounds - 1 &&
          truncatedByTokenLimit &&
          isPotentiallyIncompleteText(roundText);

        if (needsContinuationRetry) {
          continuationRetries++;
          if (rawAssistantContent && Array.isArray(rawAssistantContent) && rawAssistantContent.length > 0) {
            apiMessages.push({ role: "assistant", content: rawAssistantContent });
          } else if (roundText) {
            apiMessages.push({ role: "assistant", content: roundText });
          }
          apiMessages.push({
            role: "user",
            content: "[SYSTEM CONTINUATION] Continue exactly from where you stopped. Do not restart, summarize, or repeat. Finish the same sentence/plan before concluding.",
          });
          if (roundText) fullText += roundText;
          callbacks.onRoundEnd?.(round);
          continue;
        }

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
        // the tool_use_ids match.
        apiMessages.push({ role: "assistant", content: assistantForResults });
      }

      if (roundText) fullText += roundText;

      // Execute all tool calls in this round concurrently. Each call is
      // already serialized internally through the job queue, so running
      // them in parallel here only overlaps provider-bound waits and
      // independent commands — it does not break job ordering semantics.
      const toolResults: { id: string; content: string; isError?: boolean }[] = new Array(toolUseBlocks.length);
      await Promise.all(toolUseBlocks.map(async (block, index) => {
        callbacks.onToolCallStart?.(block.name, block.input || {});

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

      if (roundText) fullText += "\n\n";
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
    return {
      text: fullText || `[Chat error: ${msg}]`,
      toolCalls: allToolCalls,
      reason: "error",
      error: msg,
    };
  }
}
