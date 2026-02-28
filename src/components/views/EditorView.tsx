import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { JobArtifact, ArtifactType } from "../../types";
import {
  FileText, Eye, Edit3, Copy,
  Bold, Italic, Code, List, ListOrdered, Link, Image,
  Heading1, Heading2, Heading3, Quote, Minus, CheckSquare,
  Table, Plus, X, Save, FileDown, FileUp,
  Maximize2, Minimize2, Search, Replace, Undo2, Redo2,
  AlignLeft, WrapText, Hash,
  AlertTriangle, Check,
  Braces, FileJson, FileSpreadsheet,
  Sparkles, Columns,
} from "lucide-react";
import { useEditorContext } from "../../context/EditorContext";
import type { EditorAPI, PersistedEditorState } from "../../context/EditorContext";
import "../../styles/components/editor.css";

/* ─── Types ─────────────────────────────────────────────────────────── */

type EditorMode = "edit" | "preview" | "split";
type FileType = "markdown" | "json" | "yaml" | "csv" | "code" | "txt";

interface HistoryEntry {
  content: string;
  cursorPos: number;
}

/* ─── Markdown Setup ────────────────────────────────────────────────── */

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(content: string): string {
  try {
    const raw = marked.parse(content) as string;
    return DOMPurify.sanitize(raw);
  } catch {
    return content;
  }
}

/* ─── File Type Helpers ─────────────────────────────────────────────── */

function detectFileType(name: string, type?: ArtifactType): FileType {
  if (type === "json") return "json";
  if (type === "yaml") return "yaml";
  if (type === "csv") return "csv";
  if (type === "code") return "code";
  if (type === "markdown") return "markdown";
  if (type === "txt") return "txt";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, FileType> = {
    md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
    csv: "csv", ts: "code", js: "code", py: "code", rs: "code",
    txt: "txt", text: "txt", log: "txt", sh: "txt", bash: "txt",
    zsh: "txt", env: "txt", cfg: "txt", conf: "txt", ini: "txt",
    toml: "txt", properties: "txt", gitignore: "txt", dockerignore: "txt",
    editorconfig: "txt", makefile: "txt", dockerfile: "txt",
  };
  return map[ext] ?? "markdown";
}

function getFileIcon(type: FileType, size = 14) {
  switch (type) {
    case "json": return <FileJson size={size} />;
    case "yaml": return <Braces size={size} />;
    case "csv": return <FileSpreadsheet size={size} />;
    case "code": return <Code size={size} />;
    case "txt": return <AlignLeft size={size} />;
    default: return <FileText size={size} />;
  }
}

function getFileColor(type: FileType): string {
  switch (type) {
    case "json": return "#fbbf24";
    case "yaml": return "#fb923c";
    case "csv": return "#34d399";
    case "code": return "#a78bfa";
    case "txt": return "#94a3b8";
    default: return "#38bdf8";
  }
}

function getFileExtension(type: FileType): string {
  switch (type) {
    case "json": return ".json";
    case "yaml": return ".yaml";
    case "csv": return ".csv";
    case "code": return ".ts";
    case "txt": return ".txt";
    default: return ".md";
  }
}

function getMimeType(type: FileType): string {
  switch (type) {
    case "json": return "application/json";
    case "yaml": return "text/yaml";
    case "csv": return "text/csv";
    case "code": return "text/plain";
    case "txt": return "text/plain";
    default: return "text/markdown";
  }
}

/* ─── Validation ────────────────────────────────────────────────────── */

interface ValidationResult {
  valid: boolean;
  error?: string;
  formatted?: string;
}

function validateContent(content: string, type: FileType): ValidationResult {
  if (!content.trim()) return { valid: true };
  switch (type) {
    case "json": {
      try {
        const parsed = JSON.parse(content);
        return { valid: true, formatted: JSON.stringify(parsed, null, 2) };
      } catch (e) {
        return { valid: false, error: (e as Error).message };
      }
    }
    case "yaml": {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("\t")) {
          return { valid: false, error: `Tab character on line ${i + 1}. YAML requires spaces.` };
        }
      }
      return { valid: true };
    }
    case "csv": {
      const lines = content.trim().split("\n");
      if (lines.length === 0) return { valid: true };
      const headerCols = lines[0].split(",").length;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").length;
        if (cols !== headerCols) {
          return { valid: false, error: `Row ${i + 1}: ${cols} columns, expected ${headerCols}.` };
        }
      }
      return { valid: true };
    }
    default:
      return { valid: true };
  }
}

/* ─── CSV Preview ─────────────────────────────────────────────────── */

function CsvPreview({ content }: { content: string }) {
  const rows = useMemo(() => {
    const lines = content.trim().split("\n");
    return lines.map(line => {
      const cells: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === "," && !inQuotes) { cells.push(current.trim()); current = ""; continue; }
        current += ch;
      }
      cells.push(current.trim());
      return cells;
    });
  }, [content]);

  if (rows.length === 0) return <div className="editor-empty-state">Empty CSV</div>;
  const headers = rows[0];
  const dataRows = rows.slice(1);

  return (
    <div className="editor-csv-table-wrapper">
      <table className="editor-csv-table">
        <thead><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {dataRows.map((row, ri) => (
            <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Structured Preview ──────────────────────────────────────────── */

function StructuredPreview({ content, type }: { content: string; type: FileType }) {
  if (type === "csv") return <CsvPreview content={content} />;
  if (type === "json") {
    try {
      const parsed = JSON.parse(content);
      return <pre className="editor-structured-preview"><code>{JSON.stringify(parsed, null, 2)}</code></pre>;
    } catch {
      return (
        <div className="editor-structured-preview editor-structured-preview--error">
          <AlertTriangle size={14} /> Invalid JSON — fix errors to preview
        </div>
      );
    }
  }
  return <pre className="editor-structured-preview"><code>{content}</code></pre>;
}

/* ─── Toolbar Helpers ─────────────────────────────────────────────── */

interface ToolbarAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  action: (textarea: HTMLTextAreaElement) => { text: string; cursorStart: number; cursorEnd: number };
  separator?: boolean;
}

function wrapSelection(
  textarea: HTMLTextAreaElement, before: string, after: string, placeholder: string
): { text: string; cursorStart: number; cursorEnd: number } {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.substring(start, end);
  const c = selected || placeholder;
  const newText = textarea.value.substring(0, start) + before + c + after + textarea.value.substring(end);
  return { text: newText, cursorStart: start + before.length, cursorEnd: start + before.length + c.length };
}

function insertAtCursor(
  textarea: HTMLTextAreaElement, insertion: string, cursorOffset?: number
): { text: string; cursorStart: number; cursorEnd: number } {
  const start = textarea.selectionStart;
  const newText = textarea.value.substring(0, start) + insertion + textarea.value.substring(textarea.selectionEnd);
  const pos = start + (cursorOffset ?? insertion.length);
  return { text: newText, cursorStart: pos, cursorEnd: pos };
}

function prefixLine(
  textarea: HTMLTextAreaElement, prefix: string
): { text: string; cursorStart: number; cursorEnd: number } {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const adjustedEnd = lineEnd === -1 ? value.length : lineEnd;
  const selectedLines = value.substring(lineStart, adjustedEnd);
  const prefixed = selectedLines.split("\n").map((l) => prefix + l).join("\n");
  const newText = value.substring(0, lineStart) + prefixed + value.substring(adjustedEnd);
  return { text: newText, cursorStart: start + prefix.length, cursorEnd: end + prefix.length };
}

/* ═══════════════════════════════════════════════════════════════════════
 * EDITOR VIEW
 * ═══════════════════════════════════════════════════════════════════════ */

/* ─── Line Diff Algorithm (LCS-based) ──────────────────────────────── */

type DiffLineType = "unchanged" | "added" | "removed";

interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length;
  const n = newLines.length;

  // LCS via dynamic programming
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "unchanged", content: oldLines[i - 1], oldLineNum: i, newLineNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", content: newLines[j - 1], newLineNum: j });
      j--;
    } else {
      result.unshift({ type: "removed", content: oldLines[i - 1], oldLineNum: i });
      i--;
    }
  }
  return result;
}

/* ─── Inline Diff View ─────────────────────────────────────────────── */

function InlineDiffView({ diffLines }: { diffLines: DiffLine[] }) {
  return (
    <div className="editor-diff-inline">
      {diffLines.map((line, i) => (
        <div key={i} className={`editor-diff-line editor-diff-line--${line.type}`}>
          <span className="editor-diff-gutter">
            {line.type === "removed" ? "−" : line.type === "added" ? "+" : " "}
          </span>
          <span className="editor-diff-line-num">
            {line.type !== "added" ? line.oldLineNum : ""}
          </span>
          <span className="editor-diff-line-num">
            {line.type !== "removed" ? line.newLineNum : ""}
          </span>
          <span className="editor-diff-text">{line.content || "\u00A0"}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Side-by-Side Diff View ───────────────────────────────────────── */

function SideBySideDiffView({ diffLines }: { diffLines: DiffLine[] }) {
  const rows = useMemo(() => {
    const result: { left: DiffLine | null; right: DiffLine | null }[] = [];
    for (const line of diffLines) {
      if (line.type === "unchanged") {
        result.push({ left: line, right: line });
      } else if (line.type === "removed") {
        result.push({ left: line, right: null });
      } else {
        // Try to pair with a preceding unmatched removed line
        const prev = result[result.length - 1];
        if (prev && prev.right === null && prev.left?.type === "removed") {
          prev.right = line;
        } else {
          result.push({ left: null, right: line });
        }
      }
    }
    return result;
  }, [diffLines]);

  return (
    <div className="editor-diff-side">
      <div className="editor-diff-side-header">
        <div className="editor-diff-side-label">Original</div>
        <div className="editor-diff-side-label">Proposed</div>
      </div>
      <div className="editor-diff-side-body">
        {rows.map((row, i) => (
          <div key={i} className="editor-diff-side-row">
            <div className={`editor-diff-side-cell ${row.left ? `editor-diff-side-cell--${row.left.type}` : "editor-diff-side-cell--empty"}`}>
              {row.left && (
                <>
                  <span className="editor-diff-line-num">{row.left.oldLineNum ?? ""}</span>
                  <span className="editor-diff-text">{row.left.content || "\u00A0"}</span>
                </>
              )}
            </div>
            <div className={`editor-diff-side-cell ${row.right ? `editor-diff-side-cell--${row.right.type}` : "editor-diff-side-cell--empty"}`}>
              {row.right && (
                <>
                  <span className="editor-diff-line-num">{row.right.newLineNum ?? ""}</span>
                  <span className="editor-diff-text">{row.right.content || "\u00A0"}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

export interface EditorViewProps {
  updateArtifact: (id: string, updates: Partial<JobArtifact>) => void;
  importArtifact: (artifact: JobArtifact) => void;
}

export function EditorView({ updateArtifact, importArtifact }: EditorViewProps) {
  /* ─── Editor Context Registration ───────────────────────────────── */
  const { register, unregister, consumePendingArtifact, persistState, getPersistedState, proposedContent, clearProposal } = useEditorContext();

  /* ─── Restore persisted state (runs once on mount) ──────────────── */
  const restored = getPersistedState();

  /* ─── Core State ──────────────────────────────────────────────────── */
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(restored?.activeArtifactId ?? null);
  const [content, setContent] = useState(restored?.content ?? "");
  const [mode, setMode] = useState<EditorMode>((restored?.mode as EditorMode) ?? "split");
  const [docName, setDocName] = useState(restored?.docName ?? "Untitled");
  const [fileType, setFileType] = useState<FileType>((restored?.fileType as FileType) ?? "markdown");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [wordWrap, setWordWrap] = useState(restored?.wordWrap ?? true);
  const [isDirty, setIsDirty] = useState(restored?.isDirty ?? false);

  /* ─── Diff State ──────────────────────────────────────────────────── */
  type DiffViewMode = "inline" | "side-by-side";
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("inline");

  const diffLines = useMemo(() => {
    if (proposedContent === null) return [];
    return computeLineDiff(content, proposedContent);
  }, [content, proposedContent]);

  const diffStats = useMemo(() => {
    const added = diffLines.filter(l => l.type === "added").length;
    const removed = diffLines.filter(l => l.type === "removed").length;
    return { added, removed };
  }, [diffLines]);

  const acceptEdit = useCallback(() => {
    if (proposedContent !== null) {
      setContent(proposedContent);
      setIsDirty(true);
      clearProposal();
    }
  }, [proposedContent, clearProposal]);

  const rejectEdit = useCallback(() => {
    clearProposal();
  }, [clearProposal]);

  /* ─── Undo / Redo ─────────────────────────────────────────────────── */
  const [history, setHistory] = useState<HistoryEntry[]>(restored?.history ?? [{ content: "", cursorPos: 0 }]);
  const [historyIndex, setHistoryIndex] = useState(restored?.historyIndex ?? 0);
  const isUndoRedoRef = useRef(false);

  /* ─── Refs ────────────────────────────────────────────────────────── */
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validation = useMemo(() => validateContent(content, fileType), [content, fileType]);

  const stats = useMemo(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    return { words, chars: content.length, lines: content.split("\n").length };
  }, [content]);

  /* ─── Artifact Operations ─────────────────────────────────────────── */
  const loadArtifact = useCallback((artifact: JobArtifact) => {
    setContent(artifact.content || "");
    setDocName(artifact.name);
    setActiveArtifactId(artifact.id);
    setFileType(detectFileType(artifact.name, artifact.type));
    setIsDirty(false);
    setHistory([{ content: artifact.content || "", cursorPos: 0 }]);
    setHistoryIndex(0);
  }, []);

  const loadArtifactRef = useRef(loadArtifact);
  loadArtifactRef.current = loadArtifact;

  /* ─── Register Editor API ─────────────────────────────────────── */
  const contentRef = useRef(content);
  contentRef.current = content;
  const docNameRef = useRef(docName);
  docNameRef.current = docName;
  const fileTypeRef = useRef(fileType);
  fileTypeRef.current = fileType;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const validationRef = useRef(validation);
  validationRef.current = validation;
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const activeArtifactIdRef = useRef(activeArtifactId);
  activeArtifactIdRef.current = activeArtifactId;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const wordWrapRef = useRef(wordWrap);
  wordWrapRef.current = wordWrap;
  const historyRef = useRef(history);
  historyRef.current = history;
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;

  /* ─── Persist state on unmount (survives view switches) ─────────── */
  useEffect(() => {
    return () => {
      persistState({
        content: contentRef.current,
        docName: docNameRef.current,
        fileType: fileTypeRef.current,
        activeArtifactId: activeArtifactIdRef.current,
        isDirty: isDirtyRef.current,
        mode: modeRef.current,
        wordWrap: wordWrapRef.current,
        history: historyRef.current,
        historyIndex: historyIndexRef.current,
      });
    };
  }, []); // runs only on unmount — uses refs for fresh values

  useEffect(() => {
    const api: EditorAPI = {
      getState: () => ({
        docName: docNameRef.current,
        fileType: fileTypeRef.current,
        content: contentRef.current,
        isDirty: isDirtyRef.current,
        validation: validationRef.current,
        stats: statsRef.current,
        activeArtifactId: activeArtifactIdRef.current,
      }),
      setContent: (text: string) => {
        setContent(text);
        setIsDirty(true);
        contentRef.current = text;
      },
      applyCodeBlock: (markdownResponse: string): boolean => {
        const codeBlockRegex = /```(?:json|yaml|yml|csv|md|markdown|javascript|typescript|python|[\w]*)?\n([\s\S]*?)```/;
        const match = markdownResponse.match(codeBlockRegex);
        if (match && match[1]) {
          const newContent = match[1].trim();
          setContent(newContent);
          setIsDirty(true);
          contentRef.current = newContent;
          return true;
        }
        return false;
      },
      getContent: () => contentRef.current,
      getFileInfo: () => ({ docName: docNameRef.current, fileType: fileTypeRef.current }),
      loadArtifact: (artifact: JobArtifact) => loadArtifactRef.current(artifact),
    };
    register(api);
    return () => unregister();
  }, []); // stable — uses refs for fresh closures

  const previewHtml = useMemo(() =>
    fileType === "markdown" ? renderMarkdown(content) : null,
    [content, fileType]
  );

  /* ─── History ─────────────────────────────────────────────────────── */
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushHistory = useCallback((newContent: string, cursorPos: number) => {
    if (isUndoRedoRef.current) { isUndoRedoRef.current = false; return; }
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      setHistory(prev => [...prev.slice(0, historyIndex + 1), { content: newContent, cursorPos }]);
      setHistoryIndex(prev => prev + 1);
    }, 300);
  }, [historyIndex]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setIsDirty(true);
    pushHistory(newContent, textareaRef.current?.selectionStart ?? 0);
  }, [pushHistory]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoRef.current = true;
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      setContent(history[idx].content);
      setIsDirty(true);
      requestAnimationFrame(() => {
        if (textareaRef.current) { textareaRef.current.selectionStart = history[idx].cursorPos; textareaRef.current.selectionEnd = history[idx].cursorPos; }
      });
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedoRef.current = true;
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      setContent(history[idx].content);
      setIsDirty(true);
      requestAnimationFrame(() => {
        if (textareaRef.current) { textareaRef.current.selectionStart = history[idx].cursorPos; textareaRef.current.selectionEnd = history[idx].cursorPos; }
      });
    }
  }, [historyIndex, history]);

  const applyAction = useCallback((action: ToolbarAction["action"]) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const result = action(ta);
    setContent(result.text);
    setIsDirty(true);
    pushHistory(result.text, result.cursorStart);
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = result.cursorStart; ta.selectionEnd = result.cursorEnd; });
  }, [pushHistory]);

  /* ─── Toolbars ────────────────────────────────────────────────────── */
  const markdownActions: ToolbarAction[] = useMemo(() => [
    { id: "bold", icon: <Bold size={14} />, label: "Bold (Ctrl+B)", action: (ta) => wrapSelection(ta, "**", "**", "bold text") },
    { id: "italic", icon: <Italic size={14} />, label: "Italic (Ctrl+I)", action: (ta) => wrapSelection(ta, "*", "*", "italic text") },
    { id: "code", icon: <Code size={14} />, label: "Inline Code", action: (ta) => wrapSelection(ta, "`", "`", "code") },
    { id: "sep1", icon: null, label: "", action: () => ({ text: "", cursorStart: 0, cursorEnd: 0 }), separator: true },
    { id: "h1", icon: <Heading1 size={14} />, label: "Heading 1", action: (ta) => prefixLine(ta, "# ") },
    { id: "h2", icon: <Heading2 size={14} />, label: "Heading 2", action: (ta) => prefixLine(ta, "## ") },
    { id: "h3", icon: <Heading3 size={14} />, label: "Heading 3", action: (ta) => prefixLine(ta, "### ") },
    { id: "sep2", icon: null, label: "", action: () => ({ text: "", cursorStart: 0, cursorEnd: 0 }), separator: true },
    { id: "ul", icon: <List size={14} />, label: "Bullet List", action: (ta) => prefixLine(ta, "- ") },
    { id: "ol", icon: <ListOrdered size={14} />, label: "Numbered List", action: (ta) => prefixLine(ta, "1. ") },
    { id: "task", icon: <CheckSquare size={14} />, label: "Task List", action: (ta) => prefixLine(ta, "- [ ] ") },
    { id: "quote", icon: <Quote size={14} />, label: "Blockquote", action: (ta) => prefixLine(ta, "> ") },
    { id: "sep3", icon: null, label: "", action: () => ({ text: "", cursorStart: 0, cursorEnd: 0 }), separator: true },
    { id: "link", icon: <Link size={14} />, label: "Link", action: (ta) => wrapSelection(ta, "[", "](url)", "link text") },
    { id: "image", icon: <Image size={14} />, label: "Image", action: (ta) => insertAtCursor(ta, "![alt text](image-url)", 2) },
    { id: "hr", icon: <Minus size={14} />, label: "Horizontal Rule", action: (ta) => insertAtCursor(ta, "\n---\n") },
    { id: "table", icon: <Table size={14} />, label: "Table", action: (ta) => insertAtCursor(ta, "\n| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n") },
    { id: "codeblock", icon: <Hash size={14} />, label: "Code Block", action: (ta) => wrapSelection(ta, "\n```\n", "\n```\n", "code here") },
  ], []);

  const jsonActions: ToolbarAction[] = useMemo(() => [
    { id: "format", icon: <Braces size={14} />, label: "Format JSON", action: (ta) => {
      try { return { text: JSON.stringify(JSON.parse(ta.value), null, 2), cursorStart: 0, cursorEnd: 0 }; }
      catch { return { text: ta.value, cursorStart: ta.selectionStart, cursorEnd: ta.selectionEnd }; }
    }},
    { id: "minify", icon: <Minus size={14} />, label: "Minify JSON", action: (ta) => {
      try { return { text: JSON.stringify(JSON.parse(ta.value)), cursorStart: 0, cursorEnd: 0 }; }
      catch { return { text: ta.value, cursorStart: ta.selectionStart, cursorEnd: ta.selectionEnd }; }
    }},
    { id: "sep1", icon: null, label: "", action: () => ({ text: "", cursorStart: 0, cursorEnd: 0 }), separator: true },
    { id: "obj", icon: <Braces size={14} />, label: "Insert Object", action: (ta) => insertAtCursor(ta, '{\n  "key": "value"\n}') },
    { id: "arr", icon: <List size={14} />, label: "Insert Array", action: (ta) => insertAtCursor(ta, '[\n  \n]', 4) },
    { id: "str", icon: <Quote size={14} />, label: "Wrap in Quotes", action: (ta) => wrapSelection(ta, '"', '"', "value") },
  ], []);

  const yamlActions: ToolbarAction[] = useMemo(() => [
    { id: "key", icon: <Minus size={14} />, label: "Key-Value", action: (ta) => insertAtCursor(ta, "key: value\n") },
    { id: "sep1", icon: null, label: "", action: () => ({ text: "", cursorStart: 0, cursorEnd: 0 }), separator: true },
    { id: "list", icon: <List size={14} />, label: "List Item", action: (ta) => prefixLine(ta, "- ") },
    { id: "dict", icon: <Braces size={14} />, label: "Nested Dict", action: (ta) => insertAtCursor(ta, "parent:\n  child: value\n") },
    { id: "comment", icon: <Hash size={14} />, label: "Comment", action: (ta) => prefixLine(ta, "# ") },
    { id: "multiline", icon: <AlignLeft size={14} />, label: "Multiline String", action: (ta) => insertAtCursor(ta, "description: |\n  Line 1\n  Line 2\n") },
  ], []);

  const csvActions: ToolbarAction[] = useMemo(() => [
    { id: "addCol", icon: <Plus size={14} />, label: "Add Column", action: (ta) => {
      return { text: ta.value.split("\n").map(l => l + ",").join("\n"), cursorStart: ta.selectionStart, cursorEnd: ta.selectionEnd };
    }},
    { id: "addRow", icon: <ListOrdered size={14} />, label: "Add Row", action: (ta) => {
      const colCount = ta.value.split("\n")[0]?.split(",").length || 3;
      return insertAtCursor(ta, "\n" + new Array(colCount).fill("").join(","));
    }},
    { id: "sep1", icon: null, label: "", action: () => ({ text: "", cursorStart: 0, cursorEnd: 0 }), separator: true },
    { id: "headers", icon: <Heading1 size={14} />, label: "Insert Headers", action: (ta) => insertAtCursor(ta, "Name,Value,Description\n") },
  ], []);

  const txtActions: ToolbarAction[] = useMemo(() => [
    { id: "comment", icon: <Hash size={14} />, label: "Comment Line", action: (ta) => prefixLine(ta, "# ") },
    { id: "sep1", icon: null, label: "", action: () => ({ text: "", cursorStart: 0, cursorEnd: 0 }), separator: true },
    { id: "indent", icon: <List size={14} />, label: "Indent", action: (ta) => prefixLine(ta, "  ") },
    { id: "hr", icon: <Minus size={14} />, label: "Separator Line", action: (ta) => insertAtCursor(ta, "\n" + "-".repeat(40) + "\n") },
  ], []);

  const toolbarActions = useMemo(() => {
    switch (fileType) {
      case "json": return jsonActions;
      case "yaml": return yamlActions;
      case "csv": return csvActions;
      case "txt": return txtActions;
      default: return markdownActions;
    }
  }, [fileType, jsonActions, yamlActions, csvActions, txtActions, markdownActions]);

  /* ─── Keyboard Shortcuts ──────────────────────────────────────────── */
  const handleSave = useCallback(() => {
    if (activeArtifactId) {
      updateArtifact(activeArtifactId, { content, name: docName, type: fileType as ArtifactType });
      setIsDirty(false);
    } else {
      const newArtifact: JobArtifact = {
        id: `art_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: fileType as ArtifactType,
        content,
        name: docName.includes(".") ? docName : docName + getFileExtension(fileType),
        tags: [`type:${fileType}`, "source:editor"],
        createdAt: Date.now(),
        source: "user",
      };
      importArtifact(newArtifact);
      setActiveArtifactId(newArtifact.id);
      setIsDirty(false);
    }
  }, [activeArtifactId, content, docName, fileType, updateArtifact, importArtifact]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      if (e.key === "b" && fileType === "markdown") { e.preventDefault(); applyAction(markdownActions.find(a => a.id === "bold")!.action); }
      else if (e.key === "i" && fileType === "markdown") { e.preventDefault(); applyAction(markdownActions.find(a => a.id === "italic")!.action); }
      else if (e.key === "z" && !e.shiftKey && document.activeElement === textareaRef.current) { e.preventDefault(); undo(); }
      else if (((e.key === "z" && e.shiftKey) || e.key === "y") && document.activeElement === textareaRef.current) { e.preventDefault(); redo(); }
      else if (e.key === "f") { e.preventDefault(); setShowFind(prev => !prev); }
      else if (e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [applyAction, markdownActions, undo, redo, fileType, handleSave]);

  /* ─── Find & Replace ──────────────────────────────────────────────── */
  const handleFindReplace = useCallback((replaceAll = false) => {
    if (!findText) return;
    if (replaceAll) handleContentChange(content.split(findText).join(replaceText));
    else {
      const idx = content.indexOf(findText);
      if (idx === -1) return;
      handleContentChange(content.substring(0, idx) + replaceText + content.substring(idx + findText.length));
    }
  }, [content, findText, replaceText, handleContentChange]);

  /* ─── Consume pending artifact from context on mount ───────────── */
  useEffect(() => {
    const pending = consumePendingArtifact();
    if (pending) loadArtifactRef.current(pending);
  }, [consumePendingArtifact]);

  const newFile = useCallback((type: FileType = "markdown") => {
    const templates: Record<FileType, string> = {
      markdown: "# New Document\n\nStart writing here...\n",
      json: '{\n  \n}',
      yaml: "# New YAML config\n",
      csv: "Name,Value,Description\n",
      code: "// New file\n",
      txt: "",
    };
    setActiveArtifactId(null);
    setContent(templates[type]);
    setDocName("Untitled");
    setFileType(type);
    setIsDirty(false);
    setHistory([{ content: templates[type], cursorPos: 0 }]);
    setHistoryIndex(0);
  }, []);

  /* ─── Import / Export ─────────────────────────────────────────────── */
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const name = file.name.replace(/\.\w+$/, "");
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const typeMap: Record<string, FileType> = { json: "json", yaml: "yaml", yml: "yaml", csv: "csv", md: "markdown", ts: "code", js: "code", py: "code" };
      setContent(text);
      setDocName(name);
      setFileType(typeMap[ext] ?? "markdown");
      setActiveArtifactId(null);
      setIsDirty(true);
      setHistory([{ content: text, cursorPos: 0 }]);
      setHistoryIndex(0);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob([content], { type: getMimeType(fileType) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docName || "document"}${getFileExtension(fileType)}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, docName, fileType]);

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(content); } catch { /* ignore */ }
  }, [content]);

  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const newText = content.substring(0, start) + "  " + content.substring(ta.selectionEnd);
      setContent(newText);
      setIsDirty(true);
      requestAnimationFrame(() => { ta.selectionStart = start + 2; ta.selectionEnd = start + 2; });
    }
  }, [content]);

  /* ═══════════════════════════════════════════════════════════════════
   * RENDER
   * ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className={`editor-view ${isFullscreen ? "editor-view--fullscreen" : ""}`}>
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="editor-header">
        <div className="editor-header-left">
          <span style={{ color: getFileColor(fileType) }}>{getFileIcon(fileType, 16)}</span>
          <input className="editor-doc-name" value={docName} onChange={(e) => { setDocName(e.target.value); setIsDirty(true); }} placeholder="Document name..." spellCheck={false} />
          {isDirty && <span className="editor-dirty-badge">Modified</span>}
          {activeArtifactId && !isDirty && <span className="editor-saved-badge">Saved</span>}
          <select className="editor-type-select" value={fileType} onChange={(e) => setFileType(e.target.value as FileType)} title="File type">
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
            <option value="csv">CSV</option>
            <option value="code">Code</option>
            <option value="txt">Plain Text</option>
          </select>
        </div>

        <div className="editor-header-center">
          <div className="editor-mode-toggle">
            <button className={`editor-mode-btn ${mode === "edit" ? "active" : ""}`} onClick={() => setMode("edit")} title="Edit mode"><Edit3 size={13} /> Edit</button>
            <button className={`editor-mode-btn ${mode === "split" ? "active" : ""}`} onClick={() => setMode("split")} title="Split view"><AlignLeft size={13} /> Split</button>
            <button className={`editor-mode-btn ${mode === "preview" ? "active" : ""}`} onClick={() => setMode("preview")} title="Preview mode"><Eye size={13} /> Preview</button>
          </div>
        </div>

        <div className="editor-header-right">
          <button className="editor-action-btn" onClick={handleCopy} title="Copy to clipboard"><Copy size={14} /></button>
          <button className="editor-action-btn" onClick={() => fileInputRef.current?.click()} title="Import file"><FileUp size={14} /></button>
          <button className="editor-action-btn" onClick={handleExport} title="Export file"><FileDown size={14} /></button>
          <button className={`editor-action-btn ${isDirty ? "editor-action-btn--highlight" : ""}`} onClick={handleSave} title="Save to artifacts (Ctrl+S)"><Save size={14} /></button>
          <button className="editor-action-btn" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>{isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
          <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt,.text,.log,.json,.yaml,.yml,.csv,.ts,.js,.py,.sh,.bash,.zsh,.env,.cfg,.conf,.ini,.toml,.properties,.editorconfig,.gitignore,.dockerignore" onChange={handleImport} style={{ display: "none" }} />
        </div>
      </div>

      {/* ─── Toolbar ─────────────────────────────────────────────── */}
      {proposedContent === null && (mode === "edit" || mode === "split") && (
        <div className="editor-toolbar">
          <div className="editor-toolbar-actions">
            {toolbarActions.map((action) =>
              action.separator
                ? <div key={action.id} className="editor-toolbar-separator" />
                : <button key={action.id} className="editor-toolbar-btn" onClick={() => applyAction(action.action)} title={action.label}>{action.icon}</button>
            )}
          </div>
          <div className="editor-toolbar-extras">
            {fileType !== "markdown" && fileType !== "txt" && (
              <span className={`editor-validation ${validation.valid ? "valid" : "invalid"}`} title={validation.valid ? "Valid" : validation.error}>
                {validation.valid ? <Check size={12} /> : <AlertTriangle size={12} />}
                {validation.valid ? "Valid" : "Error"}
              </span>
            )}
            <button className={`editor-toolbar-btn ${showFind ? "active" : ""}`} onClick={() => setShowFind(!showFind)} title="Find & Replace (Ctrl+F)"><Search size={14} /></button>
            <button className={`editor-toolbar-btn ${wordWrap ? "active" : ""}`} onClick={() => setWordWrap(!wordWrap)} title="Word Wrap"><WrapText size={14} /></button>
            <button className="editor-toolbar-btn" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)"><Undo2 size={14} /></button>
            <button className="editor-toolbar-btn" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Shift+Z)"><Redo2 size={14} /></button>
          </div>
        </div>
      )}

      {/* ─── Diff Review Bar ─────────────────────────────────────── */}
      {proposedContent !== null && (
        <div className="editor-diff-bar">
          <div className="editor-diff-bar-left">
            <Sparkles size={14} />
            <span>AI Proposed Changes</span>
            <span className="editor-diff-stats">
              +{diffStats.added} −{diffStats.removed}
            </span>
          </div>
          <div className="editor-diff-bar-right">
            <button className="editor-diff-toggle" onClick={() => setDiffViewMode(diffViewMode === "inline" ? "side-by-side" : "inline")} title="Toggle diff view mode">
              {diffViewMode === "inline" ? <Columns size={13} /> : <AlignLeft size={13} />}
              {diffViewMode === "inline" ? "Side by Side" : "Inline"}
            </button>
            <button className="editor-diff-accept" onClick={acceptEdit} title="Accept all changes">
              <Check size={13} /> Accept
            </button>
            <button className="editor-diff-reject" onClick={rejectEdit} title="Reject all changes">
              <X size={13} /> Reject
            </button>
          </div>
        </div>
      )}

      {/* ─── Find & Replace ──────────────────────────────────────── */}
      {showFind && (
        <div className="editor-find-bar">
          <div className="editor-find-inputs">
            <div className="editor-find-field"><Search size={12} /><input value={findText} onChange={(e) => setFindText(e.target.value)} placeholder="Find..." className="editor-find-input" autoFocus /></div>
            <div className="editor-find-field"><Replace size={12} /><input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder="Replace..." className="editor-find-input" /></div>
          </div>
          <div className="editor-find-actions">
            <button className="editor-find-btn" onClick={() => handleFindReplace(false)}>Replace</button>
            <button className="editor-find-btn" onClick={() => handleFindReplace(true)}>Replace All</button>
            <button className="editor-find-close" onClick={() => setShowFind(false)}><X size={14} /></button>
          </div>
        </div>
      )}

      {/* ─── Main Content Area ───────────────────────────────────── */}
      <div className="editor-body">
        {proposedContent !== null ? (
          /* ─── Diff View ──────────────────────────────────────────── */
          <div className="editor-diff-scroll">
            {diffViewMode === "inline"
              ? <InlineDiffView diffLines={diffLines} />
              : <SideBySideDiffView diffLines={diffLines} />
            }
          </div>
        ) : (
          /* ─── Normal Editor ──────────────────────────────────────── */
          <div className={`editor-content editor-content--${mode}`}>
            {/* Editor Pane */}
            {(mode === "edit" || mode === "split") && (
              <div className="editor-pane editor-pane--edit">
                {mode === "split" && <div className="editor-pane-label">{fileType === "markdown" ? "Markdown" : fileType === "txt" ? "Plain Text" : fileType.toUpperCase()}</div>}
                <textarea
                  ref={textareaRef}
                  className={`editor-textarea ${wordWrap ? "" : "no-wrap"}`}
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder={`Start writing ${fileType}...`}
                  spellCheck={fileType === "markdown" || fileType === "txt"}
                />
              </div>
            )}

            {/* Preview Pane */}
            {(mode === "preview" || mode === "split") && (
              <div className="editor-pane editor-pane--preview">
                {mode === "split" && <div className="editor-pane-label">Preview</div>}
                {fileType === "markdown" ? (
                  <div className="editor-preview chat-md" dangerouslySetInnerHTML={{ __html: previewHtml || "" }} />
                ) : fileType === "txt" ? (
                  <div className="editor-preview">
                    <pre className="editor-structured-preview" style={{ whiteSpace: "pre-wrap" }}>{content}</pre>
                  </div>
                ) : (
                  <div className="editor-preview">
                    <StructuredPreview content={content} type={fileType} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Status Bar ──────────────────────────────────────────── */}
      <div className="editor-status-bar">
        <div className="editor-status-left">
          <span>{stats.words} words</span>
          <span>{stats.chars} chars</span>
          <span>{stats.lines} lines</span>
        </div>
        <div className="editor-status-right">
          {proposedContent !== null && (
            <span style={{ color: "#38bdf8" }}>Reviewing {diffStats.added + diffStats.removed} changes</span>
          )}
          <span style={{ color: getFileColor(fileType) }}>{fileType.toUpperCase()}</span>
          {!validation.valid && <span style={{ color: "#ef4444" }}>Errors</span>}
          {activeArtifactId && !isDirty && <span>Synced</span>}
          {isDirty && <span style={{ color: "#fbbf24" }}>Unsaved</span>}
        </div>
      </div>
    </div>
  );
}
