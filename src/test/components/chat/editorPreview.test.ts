import { describe, it, expect } from "vitest";
import {
    extractEditorPreviewContent,
    EDITOR_DOC_BEGIN,
    EDITOR_DOC_END,
} from "@/components/chat/editorPreview";

describe("extractEditorPreviewContent", () => {
    it("returns null when message is empty", () => {
        expect(extractEditorPreviewContent("")).toBeNull();
    });

    it("returns null when only meta (thinking/action) fences are present", () => {
        const msg = [
            "```thinking",
            "Confidence: 0.9",
            "Plan: do the thing",
            "```",
            "",
            "Some prose, but no document.",
            "",
            "```action",
            "{\"tool\":\"none\"}",
            "```",
        ].join("\n");
        expect(extractEditorPreviewContent(msg)).toBeNull();
    });

    it("returns the body of a single non-meta fenced block", () => {
        const msg = [
            "```thinking",
            "skip me",
            "```",
            "",
            "Here is the file:",
            "",
            "```md",
            "# Title",
            "",
            "Body line.",
            "```",
        ].join("\n");
        expect(extractEditorPreviewContent(msg)).toBe("# Title\n\nBody line.");
    });

    it("concatenates multiple non-meta fenced blocks in document order", () => {
        const msg = [
            "```thinking",
            "ignore",
            "```",
            "",
            "Part one:",
            "",
            "```md",
            "# Part 1",
            "```",
            "",
            "Part two:",
            "",
            "```md",
            "# Part 2",
            "```",
        ].join("\n");
        expect(extractEditorPreviewContent(msg)).toBe("# Part 1\n\n# Part 2");
    });

    it("honors explicit markers and unwraps a single inner fence", () => {
        const msg = [
            "Some prose before.",
            "",
            EDITOR_DOC_BEGIN,
            "```md",
            "# Marked Doc",
            "",
            "All of this is the file.",
            "```",
            EDITOR_DOC_END,
            "",
            "And some prose after — not part of the file.",
        ].join("\n");
        expect(extractEditorPreviewContent(msg)).toBe(
            "# Marked Doc\n\nAll of this is the file.",
        );
    });

    it("honors explicit markers with multiple inner fenced blocks", () => {
        const msg = [
            "Intro chatter.",
            "",
            EDITOR_DOC_BEGIN,
            "```md",
            "# Section A",
            "```",
            "(model accidentally split the file)",
            "```md",
            "# Section B",
            "```",
            EDITOR_DOC_END,
            "",
            "Trailing prose.",
        ].join("\n");
        expect(extractEditorPreviewContent(msg)).toBe(
            "# Section A\n\n# Section B",
        );
    });

    it("honors explicit markers with raw (unfenced) content between them", () => {
        const msg = [
            EDITOR_DOC_BEGIN,
            "Just plain text, no fence.",
            EDITOR_DOC_END,
        ].join("\n");
        expect(extractEditorPreviewContent(msg)).toBe(
            "Just plain text, no fence.",
        );
    });

    it("strips thinking/action fences that appear inside the marked region", () => {
        const msg = [
            EDITOR_DOC_BEGIN,
            "```thinking",
            "internal noise that must not leak",
            "```",
            "```md",
            "# Real File",
            "```",
            EDITOR_DOC_END,
        ].join("\n");
        expect(extractEditorPreviewContent(msg)).toBe("# Real File");
    });
});
