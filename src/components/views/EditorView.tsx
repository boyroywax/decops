import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { JobArtifact, ArtifactType } from "../../types";
import {
  FileText, Eye, Edit3, Copy, Trash2,
  Bold, Italic, Code, List, ListOrdered, Link, Image,
  Heading1, Heading2, Heading3, Quote, Minus, CheckSquare,
  Table, Plus, X, Save, FileDown, FileUp,
  Maximize2, Minimize2, Search, Replace, Undo2, Redo2,
  AlignLeft, WrapText, Hash, Sparkles, Send,
  ChevronRight, AlertTriangle, Check, Loader2,
  Braces, FileJson, FileSpreadsheet, File,
} from "lucide-react";
import { streamChatWithWorkspace, getSelectedModel } from "../../services/ai";
import type { ChatMessage, WorkspaceContext, StreamCallbacks, ToolCallDisplay } from "../../services/ai";
import { useLLM } from "../../context/LLMContext";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { useCommandContext } from "../../hooks/useCommandContext";
import { useJobsContext } from "../../context/JobsContext";
import { useAuth } from "../../context/AuthContext";
import { useArchitect } from "../../hooks/useArchitect";
import { useEcosystemContext } from "../../context/EcosystemContext";
import { MarkdownContent } from "../shared/MarkdownContent";
import "../../styles/components/editor.css";

/* ─── Types ─────────────────────────────────────────────────────────── */

type EditorMode = "edit" | "preview" | "split";
type FileType = "markdown" | "json" | "yaml" | "csv" | "code";

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
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, FileType> = {
    md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
    csv: "csv", ts: "code", js: "code", py: "code", rs: "code",
  };
  return map[ext] ?? "markdown";
}

function getFileIcon(type: FileType, size = 14) {
  switch (type) {
    case "json": return <FileJson size={size} />;
    case "yaml": return <Braces size={size} />;
    case "csv": return <FileSpreadsheet size={size} />;
    case "code": return <Code size={size} />;
    default: return <FileText size={size} />;
  }
}

function getFileColor(type: FileType): string {
  switch (type) {
    case "json": return "#fbbf24";
    case "yaml": return "#fb923c";
    case "csv": return "#34d399";
    case "code": return "#a78bfa";
    default: return "#38bdf8";
  }
}

function getFileExtension(type: FileType): string {
  switch (type) {
    case "json": return ".json";
    case "yaml": return ".yaml";
    case "csv": return ".csv";
    case "code": return ".ts";
    default: return ".md";
  }
}

function getMimeType(type: FileType): string {
  switch (type) {
    case "json": return "application/json";
    case "yaml": return "text/yaml";
    case "csv": return "text/csv";
    case "code": return "text/plain";
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

/* ─── AI Message Type ──────────────────────────────────────────────── */

interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

/* ═══════════════════════════════════════════════════════════════════════
 * EDITOR VIEW
 * ═══════════════════════════════════════════════════════════════════════ */

export interface EditorViewProps {
  artifacts: JobArtifact[];
  updateArtifact: (id: string, updates: Partial<JobArtifact>) => void;
  importArtifact: (artifact: JobArtifact) => void;
  removeArtifact: (id: string) => void;
}

export function EditorView({ artifacts, updateArtifact, importArtifact, removeArtifact }: EditorViewProps) {
  /* ─── Core State ──────────────────────────────────────────────────── */
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<EditorMode>("split");
  const [docName, setDocName] = useState("Untitled");
  const [fileType, setFileType] = useState<FileType>("markdown");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [wordWrap, setWordWrap] = useState(true);
  const [showArtifactPanel, setShowArtifactPanel] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  /* ─── AI Chat State ──────────────────────────────────────────────── */
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStreamingText, setAiStreamingText] = useState<string | null>(null);

  /* ─── Undo / Redo ─────────────────────────────────────────────────── */
  const [history, setHistory] = useState<HistoryEntry[]>([{ content: "", cursorPos: 0 }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false);

  /* ─── Refs ────────────────────────────────────────────────────────── */
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiEndRef = useRef<HTMLDivElement>(null);

  /* ─── Context Hooks ─────────────────────────────────────────────── */
  const { user } = useAuth();
  const workspace = useWorkspaceContext();
  const jobsCtx = useJobsContext();
  const { jobs, addJob } = jobsCtx;
  const architect = useArchitect(() => {}, addJob, jobs);
  const ecosystem = useEcosystemContext();
  const llm = useLLM();

  const commandContext = useCommandContext({
    workspace,
    user,
    jobs: jobsCtx,
    ecosystem: ecosystem || { ecosystems: [], bridges: [] },
    architect,
    addLog: () => {},
  });

  const wsContext: WorkspaceContext = useMemo(() => ({
    agents: workspace.agents,
    channels: workspace.channels,
    groups: workspace.groups,
    messages: workspace.messages,
    ecosystems: ecosystem?.ecosystems || [],
    bridges: ecosystem?.bridges || [],
    jobs: jobs || [],
  }), [workspace.agents, workspace.channels, workspace.groups, workspace.messages, ecosystem?.ecosystems, ecosystem?.bridges, jobs]);

  /* ─── Derived Data ────────────────────────────────────────────────── */
  const editableArtifacts = useMemo(() =>
    artifacts.filter(a => a.type !== "image" && a.content !== undefined),
    [artifacts]
  );

  const validation = useMemo(() => validateContent(content, fileType), [content, fileType]);

  const stats = useMemo(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    return { words, chars: content.length, lines: content.split("\n").length };
  }, [content]);

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

  const toolbarActions = useMemo(() => {
    switch (fileType) {
      case "json": return jsonActions;
      case "yaml": return yamlActions;
      case "csv": return csvActions;
      default: return markdownActions;
    }
  }, [fileType, jsonActions, yamlActions, csvActions, markdownActions]);

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

  /* ─── Artifact Operations ─────────────────────────────────────────── */
  const loadArtifact = useCallback((artifact: JobArtifact) => {
    setContent(artifact.content || "");
    setDocName(artifact.name);
    setActiveArtifactId(artifact.id);
    setFileType(detectFileType(artifact.name, artifact.type));
    setIsDirty(false);
    setShowArtifactPanel(false);
    setHistory([{ content: artifact.content || "", cursorPos: 0 }]);
    setHistoryIndex(0);
  }, []);

  const newFile = useCallback((type: FileType = "markdown") => {
    const templates: Record<FileType, string> = {
      markdown: "# New Document\n\nStart writing here...\n",
      json: '{\n  \n}',
      yaml: "# New YAML config\n",
      csv: "Name,Value,Description\n",
      code: "// New file\n",
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

  /* ─── AI Editor Chat ──────────────────────────────────────────────── */
  const sendAiMessage = useCallback(async () => {
    const text = aiInput.trim();
    if (!text || aiLoading) return;
    setAiInput("");

    const userMsg: AiMessage = { role: "user", content: text };
    const updatedMessages = [...aiMessages, userMsg];
    setAiMessages(updatedMessages);
    setAiLoading(true);
    setAiStreamingText("");

    try {
      const editorSystemSuffix = `

EDITOR MODE ACTIVE:
You are operating in the Editor view. The user has a file open and wants help editing it.

Current file: "${docName}" (${fileType})
File content (${stats.lines} lines, ${stats.words} words):
\`\`\`${fileType === "markdown" ? "md" : fileType}
${content.length > 4000 ? content.substring(0, 4000) + "\n... (truncated)" : content}
\`\`\`
${!validation.valid ? `\nValidation Error: ${validation.error}` : ""}

When helping with this file:
- Provide COMPLETE updated file content in a fenced code block so the user can apply it.
- Be precise with the format (${fileType}).
- For small edits, show context around the change and the complete replacement.
- Do NOT include explanatory text inside the code block, only the file content.`;

      const chatHistory: ChatMessage[] = updatedMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));

      const streamCallbacks: StreamCallbacks = {
        onToken: (token) => setAiStreamingText(prev => (prev ?? "") + token),
      };

      const { text: response } = await streamChatWithWorkspace(
        text + editorSystemSuffix,
        chatHistory,
        wsContext,
        streamCallbacks,
        commandContext,
      );

      setAiStreamingText(null);
      setAiMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch (err) {
      setAiStreamingText(null);
      setAiMessages(prev => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setAiLoading(false);
    }
  }, [aiInput, aiLoading, aiMessages, content, docName, fileType, stats, validation, wsContext, commandContext]);

  const applyAiCodeBlock = useCallback((responseContent: string) => {
    const codeBlockRegex = /```(?:json|yaml|yml|csv|md|markdown|javascript|typescript|python|[\w]*)?\n([\s\S]*?)```/;
    const match = responseContent.match(codeBlockRegex);
    if (match && match[1]) handleContentChange(match[1].trim());
  }, [handleContentChange]);

  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages.length, aiStreamingText]);

  const modelId = getSelectedModel();
  const modelLabel = llm.getModelById(modelId)?.label || modelId;

  /* ═══════════════════════════════════════════════════════════════════
   * RENDER
   * ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className={`editor-view ${isFullscreen ? "editor-view--fullscreen" : ""} ${showAiPanel ? "editor-view--with-ai" : ""}`}>
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
          <button className={`editor-action-btn ${showAiPanel ? "active" : ""}`} onClick={() => setShowAiPanel(!showAiPanel)} title="AI Assistant"><Sparkles size={14} /></button>
          <button className="editor-action-btn" onClick={handleCopy} title="Copy to clipboard"><Copy size={14} /></button>
          <button className="editor-action-btn" onClick={() => fileInputRef.current?.click()} title="Import file"><FileUp size={14} /></button>
          <button className="editor-action-btn" onClick={handleExport} title="Export file"><FileDown size={14} /></button>
          <button className={`editor-action-btn ${isDirty ? "editor-action-btn--highlight" : ""}`} onClick={handleSave} title="Save to artifacts (Ctrl+S)"><Save size={14} /></button>
          <button className={`editor-action-btn ${showArtifactPanel ? "active" : ""}`} onClick={() => setShowArtifactPanel(!showArtifactPanel)} title="Artifact library"><File size={14} /></button>
          <button className="editor-action-btn" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>{isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
          <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt,.json,.yaml,.yml,.csv,.ts,.js,.py" onChange={handleImport} style={{ display: "none" }} />
        </div>
      </div>

      {/* ─── Toolbar ─────────────────────────────────────────────── */}
      {(mode === "edit" || mode === "split") && (
        <div className="editor-toolbar">
          <div className="editor-toolbar-actions">
            {toolbarActions.map((action) =>
              action.separator
                ? <div key={action.id} className="editor-toolbar-separator" />
                : <button key={action.id} className="editor-toolbar-btn" onClick={() => applyAction(action.action)} title={action.label}>{action.icon}</button>
            )}
          </div>
          <div className="editor-toolbar-extras">
            {fileType !== "markdown" && (
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

      {/* ─── Artifact Library Panel ──────────────────────────────── */}
      {showArtifactPanel && (
        <div className="editor-doc-panel">
          <div className="editor-doc-panel-header">
            <span>Artifacts ({editableArtifacts.length})</span>
            <div className="editor-doc-panel-actions">
              <button className="editor-action-btn" onClick={() => newFile("markdown")} title="New Markdown"><FileText size={12} /></button>
              <button className="editor-action-btn" onClick={() => newFile("json")} title="New JSON"><FileJson size={12} /></button>
              <button className="editor-action-btn" onClick={() => newFile("yaml")} title="New YAML"><Braces size={12} /></button>
              <button className="editor-action-btn" onClick={() => newFile("csv")} title="New CSV"><FileSpreadsheet size={12} /></button>
            </div>
          </div>
          {editableArtifacts.length === 0 ? (
            <div className="editor-doc-empty">No artifacts yet. Create a new file or save your work to the artifact library.</div>
          ) : (
            <div className="editor-doc-list">
              {editableArtifacts.map((artifact) => {
                const aType = detectFileType(artifact.name, artifact.type);
                return (
                  <div key={artifact.id} className={`editor-doc-item ${artifact.id === activeArtifactId ? "active" : ""}`} onClick={() => loadArtifact(artifact)}>
                    <div className="editor-doc-item-info">
                      <span style={{ color: getFileColor(aType), flexShrink: 0 }}>{getFileIcon(aType)}</span>
                      <div className="editor-doc-item-text">
                        <span className="editor-doc-item-name">{artifact.name}</span>
                        <span className="editor-doc-item-date">
                          {artifact.createdAt ? new Date(artifact.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                          {artifact.source && <span className="editor-doc-item-source">{artifact.source}</span>}
                        </span>
                      </div>
                    </div>
                    <button className="editor-doc-item-delete" onClick={(e) => { e.stopPropagation(); removeArtifact(artifact.id); }} title="Remove from artifacts"><Trash2 size={12} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Main Content Area ───────────────────────────────────── */}
      <div className="editor-body">
        <div className={`editor-content editor-content--${mode}`}>
          {/* Editor Pane */}
          {(mode === "edit" || mode === "split") && (
            <div className="editor-pane editor-pane--edit">
              {mode === "split" && <div className="editor-pane-label">{fileType === "markdown" ? "Markdown" : fileType.toUpperCase()}</div>}
              <textarea
                ref={textareaRef}
                className={`editor-textarea ${wordWrap ? "" : "no-wrap"}`}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={`Start writing ${fileType}...`}
                spellCheck={fileType === "markdown"}
              />
            </div>
          )}

          {/* Preview Pane */}
          {(mode === "preview" || mode === "split") && (
            <div className="editor-pane editor-pane--preview">
              {mode === "split" && <div className="editor-pane-label">Preview</div>}
              {fileType === "markdown" ? (
                <div className="editor-preview chat-md" dangerouslySetInnerHTML={{ __html: previewHtml || "" }} />
              ) : (
                <div className="editor-preview">
                  <StructuredPreview content={content} type={fileType} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── AI Chat Panel ───────────────────────────────────────── */}
        {showAiPanel && (
          <div className="editor-ai-panel">
            <div className="editor-ai-header">
              <div className="editor-ai-header-left">
                <Sparkles size={14} style={{ color: "#fbbf24" }} />
                <span>AI Editor</span>
              </div>
              <div className="editor-ai-header-right">
                <span className="editor-ai-model">{modelLabel}</span>
                <button className="editor-find-close" onClick={() => setShowAiPanel(false)}><X size={14} /></button>
              </div>
            </div>

            <div className="editor-ai-messages">
              {aiMessages.length === 0 && aiStreamingText === null && (
                <div className="editor-ai-empty">
                  <Sparkles size={20} style={{ color: "#fbbf24", opacity: 0.5 }} />
                  <p>Ask the AI to help write, edit, or transform your {fileType} content.</p>
                  <div className="editor-ai-suggestions">
                    <button onClick={() => setAiInput("Fix any errors in this file")}>Fix errors</button>
                    <button onClick={() => setAiInput("Improve and expand this content")}>Improve content</button>
                    <button onClick={() => setAiInput("Convert this to a different format")}>Convert format</button>
                    {fileType === "json" && <button onClick={() => setAiInput("Add schema validation comments")}>Add schema</button>}
                    {fileType === "markdown" && <button onClick={() => setAiInput("Add a table of contents")}>Add TOC</button>}
                    {fileType === "csv" && <button onClick={() => setAiInput("Add sample data rows")}>Add sample data</button>}
                  </div>
                </div>
              )}

              {aiMessages.map((msg, i) => (
                <div key={i} className={`editor-ai-msg editor-ai-msg--${msg.role}`}>
                  {msg.role === "assistant" ? (
                    <div className="editor-ai-msg-content">
                      <MarkdownContent content={msg.content} />
                      {msg.content.includes("```") && (
                        <button className="editor-ai-apply-btn" onClick={() => applyAiCodeBlock(msg.content)} title="Apply code block to editor">
                          <ChevronRight size={12} /> Apply to editor
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="editor-ai-msg-content">{msg.content}</div>
                  )}
                </div>
              ))}

              {aiStreamingText !== null && (
                <div className="editor-ai-msg editor-ai-msg--assistant">
                  <div className="editor-ai-msg-content">
                    <MarkdownContent content={aiStreamingText || "..."} />
                  </div>
                </div>
              )}

              <div ref={aiEndRef} />
            </div>

            <div className="editor-ai-input-bar">
              <input
                className="editor-ai-input"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }}
                placeholder={`Ask AI about your ${fileType} file...`}
                disabled={aiLoading}
              />
              <button className="editor-ai-send" onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()}>
                {aiLoading ? <Loader2 size={14} className="editor-ai-spinner" /> : <Send size={14} />}
              </button>
            </div>
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
          <span style={{ color: getFileColor(fileType) }}>{fileType.toUpperCase()}</span>
          {!validation.valid && <span style={{ color: "#ef4444" }}>Errors</span>}
          {activeArtifactId && !isDirty && <span>Synced</span>}
          {isDirty && <span style={{ color: "#fbbf24" }}>Unsaved</span>}
        </div>
      </div>
    </div>
  );
}
