import { useState, useRef, useEffect } from "react";
import { Clipboard, Check } from "lucide-react";

interface CopyableIdProps {
  /** The full value (DID, public key, ID) */
  value: string;
  /** Optional label displayed before the value */
  label?: string;
  /** Max visible characters before truncating with ellipsis. 0 = show full value. */
  truncate?: number;
  /** Additional className for the outer wrapper */
  className?: string;
  /** Use monospace font (default true) */
  mono?: boolean;
}

/**
 * Displays a DID / Public Key / ID with:
 * - Full text when space allows (or truncated with tooltip when `truncate` is set)
 * - A copy-to-clipboard button
 */
export function CopyableId({
  value,
  label,
  truncate = 0,
  className = "",
  mono = true,
}: CopyableIdProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const isTruncated = truncate > 0 && value.length > truncate;
  const displayText = isTruncated
    ? value.slice(0, truncate - 6) + "…" + value.slice(-4)
    : value;

  return (
    <span className={`copyable-id ${className}`}>
      {label && <span className="copyable-id__label">{label}</span>}
      <span
        className={`copyable-id__value ${mono ? "copyable-id__value--mono" : ""}`}
        title={isTruncated ? value : undefined}
      >
        {displayText}
      </span>
      <button
        className={`copyable-id__btn ${copied ? "copyable-id__btn--copied" : ""}`}
        onClick={handleCopy}
        title={copied ? "Copied!" : `Copy ${label || "value"}`}
        type="button"
      >
        {copied ? <Check size={11} /> : <Clipboard size={11} />}
      </button>
    </span>
  );
}
