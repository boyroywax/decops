import { describe, it, expect } from "vitest";
import { MarkdownContent } from "@/components/shared/MarkdownContent";
import { render } from "@testing-library/react";
import { renderMarkdown as renderActivityMarkdown } from "@/components/activity/utils";

/**
 * Regression suite for markdown sanitization. The application renders
 * untrusted text (LLM output, deliverables, activity entries, editor
 * previews) through `marked` + `DOMPurify.sanitize`. If anyone removes
 * the sanitizer, these tests fail.
 */
describe("markdown sanitization", () => {
    const xssVectors = [
        `<script>alert("xss")</script>hello`,
        `<img src=x onerror="alert('xss')">`,
        `<a href="javascript:alert('xss')">click</a>`,
        `<iframe src="https://evil.example"></iframe>`,
        `<svg onload="alert('xss')"></svg>`,
    ];

    describe("MarkdownContent component", () => {
        for (const vector of xssVectors) {
            it(`strips dangerous HTML: ${vector.slice(0, 30)}\u2026`, () => {
                const { container } = render(<MarkdownContent content={vector} />);
                const html = container.innerHTML;
                expect(html.toLowerCase()).not.toContain("<script");
                expect(html.toLowerCase()).not.toContain("onerror=");
                expect(html.toLowerCase()).not.toContain("onload=");
                expect(html.toLowerCase()).not.toContain("javascript:");
                expect(html.toLowerCase()).not.toContain("<iframe");
            });
        }

        it("preserves safe markdown formatting", () => {
            const { container } = render(<MarkdownContent content="**bold** and _italic_" />);
            const html = container.innerHTML;
            expect(html).toContain("<strong>bold</strong>");
            expect(html).toContain("<em>italic</em>");
        });
    });

    describe("activity utils.renderMarkdown", () => {
        for (const vector of xssVectors) {
            it(`strips dangerous HTML: ${vector.slice(0, 30)}\u2026`, () => {
                const html = renderActivityMarkdown(vector).toLowerCase();
                expect(html).not.toContain("<script");
                expect(html).not.toContain("onerror=");
                expect(html).not.toContain("onload=");
                expect(html).not.toContain("javascript:");
                expect(html).not.toContain("<iframe");
            });
        }
    });
});
