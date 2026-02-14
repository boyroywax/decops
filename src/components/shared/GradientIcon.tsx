import React, { useId } from "react";
import type { LucideIcon } from "lucide-react";

interface GradientIconProps {
    icon: LucideIcon;
    size?: number;
    gradient?: [string, string];
    className?: string;
    style?: React.CSSProperties;
    strokeWidth?: number;
}

/**
 * Renders a Lucide icon with an optional two-stop linear gradient.
 * If no gradient is provided, falls back to `currentColor`.
 *
 * Usage:
 *   <GradientIcon icon={Zap} size={16} gradient={["#00e5a0", "#38bdf8"]} />
 */
export function GradientIcon({
    icon: Icon,
    size = 16,
    gradient,
    className,
    style,
    strokeWidth = 2,
}: GradientIconProps) {
    const uid = useId().replace(/:/g, "");

    if (!gradient) {
        return <Icon size={size} className={className} style={{ ...style, flexShrink: 0 }} strokeWidth={strokeWidth} />;
    }

    const gradientId = `gi${uid}`;

    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                width: size,
                height: size,
                position: "relative",
                ...style,
            }}
            className={className}
        >
            {/* Hidden SVG with gradient definition */}
            <svg width={0} height={0} style={{ position: "absolute" }}>
                <defs>
                    <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={gradient[0]} />
                        <stop offset="100%" stopColor={gradient[1]} />
                    </linearGradient>
                </defs>
            </svg>
            <Icon
                size={size}
                strokeWidth={strokeWidth}
                style={{ stroke: `url(#${gradientId})`, flexShrink: 0 }}
            />
        </span>
    );
}
