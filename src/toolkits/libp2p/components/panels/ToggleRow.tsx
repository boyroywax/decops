/**
 * ToggleRow — shared checkbox row used by libp2p start-option panels.
 */

export interface ToggleRowProps {
    label: string;
    hint?: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (next: boolean) => void;
}

export function ToggleRow({ label, hint, checked, disabled, onChange }: ToggleRowProps) {
    return (
        <label className={`libp2p-toggle${disabled ? " libp2p-toggle--disabled" : ""}`}>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span className="libp2p-toggle-label">{label}</span>
            {hint && <span className="libp2p-toggle-hint">{hint}</span>}
        </label>
    );
}
