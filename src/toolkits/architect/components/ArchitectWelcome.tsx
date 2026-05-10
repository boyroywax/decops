import { Sparkles } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { SCENARIO_PRESETS } from "@/constants";

interface ArchitectWelcomeProps {
    onPrompt?: (text: string) => void;
}

/**
 * Welcome panel rendered by the chat panel when the Architect agent is
 * active and the conversation is empty. The Architect "speaks first" —
 * introduces itself and offers sample scenarios as cards. Clicking a card
 * primes the chat input with that scenario's description.
 */
export function ArchitectWelcome({ onPrompt }: ArchitectWelcomeProps) {
    return (
        <div className="architect-welcome">
            <div className="architect-welcome__hero">
                <GradientIcon icon={Sparkles} size={28} gradient={["#fbbf24", "#fcd34d"]} />
                <div className="architect-welcome__hero-title">Architect</div>
                <div className="architect-welcome__hero-desc">
                    Describe a network or multi-agent ecosystem in plain English and
                    I'll generate a deployable blueprint — roles, channels, governance,
                    and bridges. Pick a sample below or type your own idea.
                </div>
            </div>
            <div className="architect-welcome__grid">
                {SCENARIO_PRESETS.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        className="architect-welcome__card"
                        style={{ ["--card-accent" as any]: s.color }}
                        onClick={() => onPrompt?.(s.desc)}
                    >
                        <div className="architect-welcome__card-head">
                            {s.icon}
                            <span className="architect-welcome__card-label">{s.label}</span>
                        </div>
                        <div className="architect-welcome__card-desc">{s.desc}</div>
                    </button>
                ))}
            </div>
        </div>
    );
}
