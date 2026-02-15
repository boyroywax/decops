import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '../../hooks/useLocalStorage';

describe('useLocalStorage', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('returns initial value when storage is empty', () => {
        const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));
        expect(result.current[0]).toBe('initial');
    });

    it('stores and retrieves values', () => {
        const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

        act(() => {
            result.current[1]('updated');
        });

        expect(result.current[0]).toBe('updated');
        expect(window.localStorage.getItem('test-key')).toBe(JSON.stringify('updated'));
    });

    it('initializes from existing local storage', () => {
        window.localStorage.setItem('test-key', JSON.stringify('existing'));
        const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));
        expect(result.current[0]).toBe('existing');
    });

    it('supports functional updates', () => {
        const { result } = renderHook(() => useLocalStorage<number>('count', 0));

        act(() => {
            result.current[1](prev => prev + 1);
        });

        expect(result.current[0]).toBe(1);
    });
});
