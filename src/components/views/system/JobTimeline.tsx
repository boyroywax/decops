/**
 * JobTimeline — vertical event timeline for a job.
 *
 * §3.3 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import { Clock } from "lucide-react";
import type { JobEvent } from "@/types";
import { formatDuration, eventIcon } from "./helpers";

interface JobTimelineProps {
    timeline: JobEvent[];
    startedAt?: number;
}

export function JobTimeline({ timeline, startedAt }: JobTimelineProps) {
    if (!timeline || timeline.length === 0) return null;
    const origin = startedAt || timeline[0]?.timestamp;
    return (
        <div className="sys-timeline">
            <div className="sys-timeline__label">
                <Clock size={11} /> Timeline ({timeline.length} events)
            </div>
            <div className="sys-timeline__track">
                {timeline.map((evt, i) => {
                    const elapsed = origin ? evt.timestamp - origin : 0;
                    const elapsedStr = elapsed <= 0 ? "0s" : formatDuration(elapsed);
                    return (
                        <div key={i} className={`sys-timeline__event sys-timeline__event--${evt.kind.replace(":", "-")}`}>
                            <div className="sys-timeline__connector">
                                <div className="sys-timeline__dot">{eventIcon(evt.kind)}</div>
                                {i < timeline.length - 1 && <div className="sys-timeline__line" />}
                            </div>
                            <div className="sys-timeline__content">
                                <div className="sys-timeline__event-header">
                                    <span className="sys-timeline__event-label">{evt.label}</span>
                                    <span className="sys-timeline__event-time">
                                        +{elapsedStr}
                                        {evt.duration != null && (
                                            <span className="sys-timeline__event-dur"> · {formatDuration(evt.duration)}</span>
                                        )}
                                    </span>
                                </div>
                                {evt.detail && (
                                    <div className="sys-timeline__event-detail">{evt.detail}</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
