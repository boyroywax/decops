import { useEffect, useRef } from "react";

/**
 * useFocusTrap — minimal accessibility hook for modals.
 *
 * When `active` is true, traps Tab/Shift+Tab focus inside the returned ref,
 * focuses the first focusable element on mount, and restores focus to the
 * previously-active element on unmount. Also calls `onEscape` when the user
 * presses Escape (callers can wire this to their close handler).
 *
 * Usage:
 *   const ref = useFocusTrap<HTMLDivElement>(open, onClose);
 *   return open ? <div ref={ref} role="dialog" aria-modal>…</div> : null;
 */
export function useFocusTrap<T extends HTMLElement>(
    active: boolean,
    onEscape?: () => void,
) {
    const containerRef = useRef<T>(null);

    useEffect(() => {
        if (!active) return;
        const container = containerRef.current;
        if (!container) return;

        const previouslyFocused = document.activeElement as HTMLElement | null;

        const focusableSelector =
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

        const isVisible = (el: HTMLElement): boolean => {
            if (el.hasAttribute("hidden")) return false;
            if (el.getAttribute("aria-hidden") === "true") return false;
            // In real browsers offsetParent is null for display:none. In jsdom
            // offsetParent is always null, so fall back to computed style there.
            if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
                const style = window.getComputedStyle(el);
                if (style.display === "none" || style.visibility === "hidden") return false;
            }
            return true;
        };

        const getFocusable = (): HTMLElement[] =>
            Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(isVisible);

        // Focus first focusable element
        const focusables = getFocusable();
        if (focusables.length > 0) {
            focusables[0].focus();
        } else {
            // Ensure container itself is focusable so screen readers anchor on it
            container.setAttribute("tabindex", "-1");
            container.focus();
        }

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && onEscape) {
                e.stopPropagation();
                onEscape();
                return;
            }
            if (e.key !== "Tab") return;
            const items = getFocusable();
            if (items.length === 0) {
                e.preventDefault();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const activeEl = document.activeElement as HTMLElement | null;
            if (e.shiftKey) {
                if (activeEl === first || !container.contains(activeEl)) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (activeEl === last || !container.contains(activeEl)) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener("keydown", handleKey, true);
        return () => {
            document.removeEventListener("keydown", handleKey, true);
            // Restore focus
            if (previouslyFocused && typeof previouslyFocused.focus === "function") {
                previouslyFocused.focus();
            }
        };
    }, [active, onEscape]);

    return containerRef;
}
