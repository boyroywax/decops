import { useState, useCallback } from "react";

/**
 * Hook for standardized 2-step delete confirmation.
 * Returns state + handlers for showing an inline confirmation panel
 * before executing a destructive action.
 *
 * Usage:
 *   const del = useDeleteConfirm();
 *   // In UI:
 *   <button onClick={() => del.requestDelete(id)}>
 *   {del.isPending(id) && <DeleteConfirmInline ... onConfirm={() => del.confirm(() => doDelete(id))} onCancel={del.cancel} />}
 */
export function useDeleteConfirm() {
    const [pendingId, setPendingId] = useState<string | null>(null);

    const requestDelete = useCallback((id: string) => {
        setPendingId(id);
    }, []);

    const cancel = useCallback(() => {
        setPendingId(null);
    }, []);

    const confirm = useCallback((action: () => void) => {
        action();
        setPendingId(null);
    }, []);

    const isPending = useCallback((id: string) => pendingId === id, [pendingId]);

    return { pendingId, requestDelete, cancel, confirm, isPending };
}
