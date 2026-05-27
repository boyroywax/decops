/**
 * ConnectPanel — Libp2pView's "Connect" section.
 *
 * Dial-target input plus expandable default-bootstrap-peers list.
 * Pure presentation: parent owns dialTarget state, busy flag, and the
 * handleDial callback.
 *
 * §3.1 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import { Link2 } from "lucide-react";
import { DEFAULT_BOOTSTRAP } from "../../service";

interface ConnectPanelProps {
    dialTarget: string;
    setDialTarget: (value: string) => void;
    isRunning: boolean;
    busy: boolean;
    onDial: () => void;
}

export function ConnectPanel({ dialTarget, setDialTarget, isRunning, busy, onDial }: ConnectPanelProps) {
    return (
        <section className="libp2p-panel">
            <h3><Link2 size={14} /> Connect</h3>
            <div className="libp2p-form-row">
                <input
                    type="text"
                    className="libp2p-input"
                    placeholder="/dnsaddr/example.com/p2p/Qm… or peer id"
                    value={dialTarget}
                    onChange={(e) => setDialTarget(e.target.value)}
                    disabled={!isRunning || busy}
                />
                <button
                    className="libp2p-btn"
                    disabled={!isRunning || busy || !dialTarget.trim()}
                    onClick={onDial}
                >
                    Dial
                </button>
            </div>
            <details className="libp2p-bootstrap">
                <summary>Default bootstrap peers ({DEFAULT_BOOTSTRAP.length})</summary>
                <ul className="libp2p-addr-list">
                    {DEFAULT_BOOTSTRAP.map((ma) => (
                        <li key={ma}>
                            <code className="libp2p-mono">{ma}</code>
                            <button
                                className="libp2p-icon-btn"
                                title="Use as dial target"
                                onClick={() => setDialTarget(ma)}
                                aria-label="Use as dial target"
                            >
                                <Link2 size={12} />
                            </button>
                        </li>
                    ))}
                </ul>
            </details>
        </section>
    );
}
