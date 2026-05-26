/**
 * Helpers for the chat "Preview in Editor" action.
 *
 * Lives outside ChatPanel.tsx so it can be unit-tested without pulling
 * the full React component tree into the test.
 */

const EDITOR_PREVIEW_EXCLUDED_FENCES = new Set(["thinking", "action"]);

/**
 * Invisible markers the AI is instructed to wrap the full intended
 * editor document with. Using explicit begin/end markers lets the model
 * split its content across multiple fenced blocks (e.g. when streaming
 * long files) while still letting us reassemble the complete document
 * for `Preview in Editor`.
 */
export const EDITOR_DOC_BEGIN = "<<<EDITOR_FILE_BEGIN>>>";
export const EDITOR_DOC_END = "<<<EDITOR_FILE_END>>>";

/**
 * Extract the assistant's intended editor document from a chat message.
 *
 * Strategy (in priority order):
 *   1. If explicit `<<<EDITOR_FILE_BEGIN>>>` / `<<<EDITOR_FILE_END>>>`
 *      markers are present, use everything between them (stripping any
 *      meta fences like ```thinking and unwrapping the outer ```lang fence
 *      if the entire body is a single code block). Multiple fenced blocks
 *      between the markers are concatenated in order.
 *   2. Otherwise, concatenate every non-meta fenced code block in the
 *      message in order (separated by a blank line) so multi-part outputs
 *      become one cohesive document.
 *
 * Returns `null` when no previewable content is found.
 */
export function extractEditorPreviewContent(messageContent: string): string | null {
    if (!messageContent) return null;

    const beginIdx = messageContent.indexOf(EDITOR_DOC_BEGIN);
    const endIdx = messageContent.indexOf(EDITOR_DOC_END);

    // 1. Explicit markers — strongest signal.
    if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
        const between = messageContent
            .slice(beginIdx + EDITOR_DOC_BEGIN.length, endIdx)
            .replace(/```thinking[\s\S]*?```/g, "")
            .replace(/```action[\s\S]*?```/g, "")
            .trim();

        const fencedBlocks = collectFencedBlocks(between);
        if (fencedBlocks.length > 0) {
            return joinDocumentParts(fencedBlocks);
        }

        // No fences inside the markers — treat the literal body as the
        // intended document (lets users force plain-text mode).
        return between || null;
    }

    // 2. Concatenate every non-meta fenced block in the whole message.
    const blocks = collectFencedBlocks(messageContent);
    if (blocks.length === 0) return null;
    return joinDocumentParts(blocks);
}

function collectFencedBlocks(input: string): string[] {
    const blockRe = /```([^\n`]*)\n([\s\S]*?)```/g;
    const out: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = blockRe.exec(input)) !== null) {
        const rawInfo = (match[1] || "").trim().toLowerCase();
        const fenceLang = rawInfo.split(/\s+/)[0] || "";
        if (EDITOR_PREVIEW_EXCLUDED_FENCES.has(fenceLang)) continue;

        const body = (match[2] || "").replace(/\s+$/u, "");
        if (!body.trim()) continue;
        out.push(body);
    }

    return out;
}

function joinDocumentParts(parts: string[]): string {
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0].trim();
    return parts.map(p => p.trim()).join("\n\n").trim();
}
