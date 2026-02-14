import { useState, useCallback } from "react";

export function useBulkSelect() {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const toggle = useCallback((id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const selectAll = useCallback((ids: string[]) => {
        setSelected(new Set(ids));
    }, []);

    const clearSelection = useCallback(() => {
        setSelected(new Set());
    }, []);

    const isAllSelected = useCallback(
        (ids: string[]) => ids.length > 0 && ids.every((id) => selected.has(id)),
        [selected]
    );

    const toggleAll = useCallback(
        (ids: string[]) => {
            if (ids.length > 0 && ids.every((id) => selected.has(id))) {
                setSelected(new Set());
            } else {
                setSelected(new Set(ids));
            }
        },
        [selected]
    );

    return {
        selected,
        count: selected.size,
        toggle,
        selectAll,
        clearSelection,
        isAllSelected,
        toggleAll,
        has: (id: string) => selected.has(id),
    };
}
