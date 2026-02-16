import { createContext, useContext } from 'react';
import { useEcosystem } from '../hooks/useEcosystem';

// Infer the return type of useEcosystem
export type UseEcosystemReturn = ReturnType<typeof useEcosystem>;

export const EcosystemContext = createContext<UseEcosystemReturn | null>(null);

export function useEcosystemContext() {
    const context = useContext(EcosystemContext);
    if (!context) {
        throw new Error("useEcosystemContext must be used within an EcosystemContext.Provider");
    }
    return context;
}
