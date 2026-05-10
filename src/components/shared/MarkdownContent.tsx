import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Configure marked for safe, styled rendering
marked.setOptions({ breaks: true, gfm: true });

interface MarkdownContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
  /** Wrap output in a <span> instead of <div> (for inline contexts) */
  inline?: boolean;
}

/**
 * Shared component that renders markdown text as sanitized HTML.
 * Applies the `chat-md` class for consistent markdown styling.
 */
export function MarkdownContent({ content, className, style, inline }: MarkdownContentProps) {
  const html = useMemo(() => {
    try {
      const raw = marked.parse(content) as string;
      return DOMPurify.sanitize(raw);
    } catch {
      return content;
    }
  }, [content]);

  const cls = className ? `chat-md ${className}` : "chat-md";

  if (inline) {
    return <span className={cls} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return <div className={cls} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}
