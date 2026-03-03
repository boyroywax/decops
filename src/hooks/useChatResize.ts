import { useState, useCallback, useEffect } from "react";
import type { ChatPosition } from "../context/ThemeContext";

/**
 * Hook for drag-to-resize behavior on the chat panel.
 */
export function useChatResize(
    position: ChatPosition,
    height: number,
    setHeight: (h: number) => void,
) {
    const [isResizing, setIsResizing] = useState(false);
    const isSide = position === "left" || position === "right";

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing) {
            if (isSide) {
                const newWidth = position === "left"
                    ? e.clientX
                    : window.innerWidth - e.clientX;
                if (newWidth > 280 && newWidth < window.innerWidth - 400) {
                    setHeight(newWidth);
                }
            } else {
                const newHeight = window.innerHeight - e.clientY;
                if (newHeight > 200 && newHeight < window.innerHeight - 100) {
                    setHeight(newHeight);
                }
            }
        }
    }, [isResizing, setHeight, isSide, position]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener("mousemove", resize);
            window.addEventListener("mouseup", stopResizing);
        }
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    return { isResizing, isSide, startResizing };
}
