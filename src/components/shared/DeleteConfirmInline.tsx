import { Trash2 } from "lucide-react";
import "../../styles/components/delete-confirm.css";

interface DeleteConfirmInlineProps {
    /** What entity is being deleted, e.g. "Agent", "Channel" */
    entityName: string;
    /** Optional entity label/name to show */
    entityLabel?: string;
    /** Warning text. Defaults to "This action cannot be undone." */
    warning?: string;
    /** Called when user clicks Confirm */
    onConfirm: () => void;
    /** Called when user clicks Cancel */
    onCancel: () => void;
    /** Compact mode for small inline areas (e.g. list rows) */
    compact?: boolean;
}

/**
 * Standardized inline delete confirmation panel.
 * Replaces the content area (e.g. back face of a flip card, or an action row)
 * with a 2-step confirmation: icon + title + warning + Cancel/Confirm buttons.
 */
export function DeleteConfirmInline({
    entityName,
    entityLabel,
    warning = "This action cannot be undone.",
    onConfirm,
    onCancel,
    compact = false,
}: DeleteConfirmInlineProps) {
    if (compact) {
        return (
            <div className="delete-confirm delete-confirm--compact">
                <div className="delete-confirm__body">
                    <Trash2 size={14} className="delete-confirm__icon" />
                    <span className="delete-confirm__title-inline">
                        Delete {entityLabel || entityName}?
                    </span>
                </div>
                <div className="delete-confirm__actions">
                    <button
                        onClick={(e) => { e.stopPropagation(); onCancel(); }}
                        className="delete-confirm__cancel"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onConfirm(); }}
                        className="delete-confirm__confirm"
                    >
                        Delete
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="delete-confirm">
            <div className="delete-confirm__body">
                <Trash2 size={24} className="delete-confirm__icon" />
                <h3 className="delete-confirm__title">
                    Delete {entityName}?
                </h3>
                {entityLabel && (
                    <div className="delete-confirm__label">{entityLabel}</div>
                )}
                <p className="delete-confirm__warning">{warning}</p>
            </div>
            <div className="delete-confirm__actions">
                <button
                    onClick={(e) => { e.stopPropagation(); onCancel(); }}
                    className="delete-confirm__cancel"
                >
                    Cancel
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onConfirm(); }}
                    className="delete-confirm__confirm"
                >
                    Confirm
                </button>
            </div>
        </div>
    );
}
