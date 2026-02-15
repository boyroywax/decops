import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBulkSelect } from '../../hooks/useBulkSelect';

describe('useBulkSelect', () => {
    it('initializes with empty selection', () => {
        const { result } = renderHook(() => useBulkSelect());
        expect(result.current.selected.size).toBe(0);
        expect(result.current.count).toBe(0);
    });

    it('toggles selection', () => {
        const { result } = renderHook(() => useBulkSelect());

        act(() => {
            result.current.toggle('item1');
        });
        expect(result.current.has('item1')).toBe(true);
        expect(result.current.count).toBe(1);

        act(() => {
            result.current.toggle('item1');
        });
        expect(result.current.has('item1')).toBe(false);
        expect(result.current.count).toBe(0);
    });

    it('selects all', () => {
        const { result } = renderHook(() => useBulkSelect());
        const items = ['item1', 'item2', 'item3'];

        act(() => {
            result.current.selectAll(items);
        });
        expect(result.current.count).toBe(3);
        expect(result.current.isAllSelected(items)).toBe(true);
    });

    it('clears selection', () => {
        const { result } = renderHook(() => useBulkSelect());
        const items = ['item1', 'item2'];

        act(() => {
            result.current.selectAll(items);
            result.current.clearSelection();
        });
        expect(result.current.count).toBe(0);
    });

    it('toggles all (selects all if not all selected)', () => {
        const { result } = renderHook(() => useBulkSelect());
        const items = ['item1', 'item2'];

        // Select one
        act(() => {
            result.current.toggle('item1');
        });

        // Toggle all -> should select all
        act(() => {
            result.current.toggleAll(items);
        });
        expect(result.current.isAllSelected(items)).toBe(true);
    });

    it('toggles all (deselects if all selected)', () => {
        const { result } = renderHook(() => useBulkSelect());
        const items = ['item1', 'item2'];

        act(() => {
            result.current.selectAll(items);
        });

        act(() => {
            result.current.toggleAll(items);
        });
        expect(result.current.count).toBe(0);
    });
});
