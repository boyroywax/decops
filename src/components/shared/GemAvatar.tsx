import { useMemo } from "react";

// Generate deterministic gradient colors from a string
function hashToColors(str: string): string[] {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash;
    }
    const colors: string[] = [];
    for (let i = 0; i < 4; i++) {
        const h = ((hash >> (i * 8)) & 0xff) * 1.41;
        const s = 65 + ((hash >> (i * 4)) & 0x1f);
        const l = 50 + ((hash >> (i * 6)) & 0xf);
        colors.push(`hsl(${Math.round(h % 360)}, ${s}%, ${l}%)`);
    }
    return colors;
}

export function GemAvatar({ seed, size = 28 }: { seed: string; size?: number }) {
    const colors = useMemo(() => hashToColors(seed), [seed]);
    const id = useMemo(() => `gem-${seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`, [seed]);

    return (
        <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
                    <stop stopColor={colors[0]} />
                    <stop offset="0.3" stopColor={colors[1]} />
                    <stop offset="0.6" stopColor={colors[2]} />
                    <stop offset="1" stopColor={colors[3]} />
                </linearGradient>
            </defs>
            <g>
                <path d="M100 20L20 70L100 120L180 70L100 20Z" fill={`url(#grad-${id})`} />
                <path d="M20 70L100 120L100 170L20 120L20 70Z" fill={`url(#grad-${id})`} fillOpacity="0.7" />
                <path d="M180 70L100 120L100 170L180 120L180 70Z" fill={`url(#grad-${id})`} fillOpacity="0.5" />
            </g>
        </svg>
    );
}
