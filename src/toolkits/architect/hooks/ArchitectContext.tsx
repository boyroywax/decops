import { createContext, useContext, type ReactNode } from "react";
import type { useArchitect } from "./useArchitect";

type ArchitectState = ReturnType<typeof useArchitect>;

const Ctx = createContext<ArchitectState | null>(null);

export function ArchitectProvider({
    value, children,
}: {
    value: ArchitectState;
    children: ReactNode;
}) {
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Returns the shared architect state, or null when no provider is mounted. */
export function useArchitectContext(): ArchitectState | null {
    return useContext(Ctx);
}
