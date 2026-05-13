import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

function Modal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const ref = useFocusTrap<HTMLDivElement>(open, onClose);
    if (!open) return null;
    return (
        <div ref={ref} role="dialog">
            <button>first</button>
            <button>second</button>
            <button>third</button>
        </div>
    );
}

describe("useFocusTrap [§6.2]", () => {
    it("focuses the first focusable element when active", () => {
        const { getAllByRole } = render(<Modal open={true} onClose={() => { }} />);
        const buttons = getAllByRole("button");
        expect(document.activeElement).toBe(buttons[0]);
    });

    it("invokes onEscape when Escape pressed", () => {
        let called = 0;
        const onEsc = () => { called++; };
        render(<Modal open={true} onClose={onEsc} />);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(called).toBe(1);
    });

    it("renders nothing when inactive", () => {
        const { container } = render(<Modal open={false} onClose={() => { }} />);
        expect(container.firstChild).toBeNull();
    });

    it("wraps focus from last element back to first on Tab", () => {
        const { getAllByRole } = render(<Modal open={true} onClose={() => { }} />);
        const buttons = getAllByRole("button");
        buttons[buttons.length - 1].focus();
        fireEvent.keyDown(document, { key: "Tab" });
        expect(document.activeElement).toBe(buttons[0]);
    });

    it("wraps focus from first to last on Shift+Tab", () => {
        const { getAllByRole } = render(<Modal open={true} onClose={() => { }} />);
        const buttons = getAllByRole("button");
        buttons[0].focus();
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    });
});
