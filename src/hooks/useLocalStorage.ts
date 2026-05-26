import { useState, useEffect, useCallback, useRef } from "react";

// Unique ID per hook instance to avoid self-triggering on custom events
let instanceCounter = 0;

export function useLocalStorage<T>(key: string, initialValue: T) {
    const instanceId = useRef(++instanceCounter).current;
    // Get from local storage then parse stored json or return initialValue
    const readValue = useCallback((): T => {
        if (typeof window === "undefined") {
            return initialValue;
        }

        try {
            const item = window.localStorage.getItem(key);
            return item ? (JSON.parse(item) as T) : initialValue;
        } catch (error) {
            console.warn(`Error reading localStorage key "${key}":`, error);
            return initialValue;
        }
    }, [initialValue, key]);

    const [storedValue, setStoredValue] = useState<T>(readValue);

    // Keep a ref to the latest value so localStorage writes are always current
    const valueRef = useRef(storedValue);
    useEffect(() => {
        valueRef.current = storedValue;
    }, [storedValue]);

    const setValue = useCallback(
        (value: T | ((val: T) => T)) => {
            try {
                // Resolve the new value synchronously using the latest ref so
                // we can write to localStorage and dispatch the sync event
                // immediately (React's setState updater can be deferred in
                // concurrent mode, which would race the dispatch).
                const prev = valueRef.current;
                const valueToStore =
                    value instanceof Function ? (value as (val: T) => T)(prev) : value;

                let serialized: string | null = null;
                if (typeof window !== "undefined") {
                    serialized = JSON.stringify(valueToStore);
                    try {
                        window.localStorage.setItem(key, serialized);
                    } catch (writeErr) {
                        // Quota or other write failure. If the new value is an
                        // array, try once with the most recent half — useful
                        // for unbounded job/artifact lists. If that still
                        // fails, drop persistence for this write so the React
                        // tree stays alive (state updates in-memory).
                        const isQuota = writeErr instanceof DOMException
                            && (writeErr.name === "QuotaExceededError"
                                || writeErr.name === "NS_ERROR_DOM_QUOTA_REACHED");
                        if (isQuota && Array.isArray(valueToStore) && valueToStore.length > 1) {
                            const trimmed = valueToStore.slice(0, Math.max(1, Math.floor(valueToStore.length / 2)));
                            try {
                                const trimmedSerialized = JSON.stringify(trimmed);
                                window.localStorage.setItem(key, trimmedSerialized);
                                serialized = trimmedSerialized;
                                console.warn(`useLocalStorage: "${key}" exceeded quota — trimmed from ${valueToStore.length} to ${trimmed.length} items.`);
                            } catch (trimErr) {
                                console.warn(`useLocalStorage: "${key}" quota recovery failed; persistence disabled this write.`, trimErr);
                                serialized = null;
                            }
                        } else {
                            console.warn(`useLocalStorage: failed to write "${key}".`, writeErr);
                            serialized = null;
                        }
                    }
                }

                // Update local state
                setStoredValue(valueToStore);
                valueRef.current = valueToStore;

                // Notify other hook instances in this tab
                if (serialized !== null) {
                    window.dispatchEvent(new CustomEvent('local-storage-sync', {
                        detail: { key, newValue: serialized, sourceInstance: instanceId }
                    }));
                }
            } catch (error) {
                console.warn(`Error setting localStorage key "${key}":`, error);
            }
        },
        [key, instanceId]
    );

    useEffect(() => {
        setStoredValue(readValue());
        // reason: re-sync once on mount; readValue is stable via useCallback and
        // adding it would re-run on every render-fresh ref. §5.4.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === key && e.newValue !== null) {
                try {
                    setStoredValue(JSON.parse(e.newValue));
                } catch (error) {
                    console.warn(`Error parsing storage change for key "${key}":`, error);
                }
            }
        };

        // Listen for same-tab sync events from other hook instances
        const handleLocalSync = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            // Skip events dispatched by this same hook instance
            if (detail.sourceInstance === instanceId) return;
            if (detail.key === key && detail.newValue !== null) {
                try {
                    setStoredValue(JSON.parse(detail.newValue));
                } catch (error) {
                    console.warn(`Error parsing local sync for key "${key}":`, error);
                }
            }
        };

        window.addEventListener("storage", handleStorageChange);
        window.addEventListener("local-storage-sync", handleLocalSync);
        return () => {
            window.removeEventListener("storage", handleStorageChange);
            window.removeEventListener("local-storage-sync", handleLocalSync);
        };
    }, [key]);

    return [storedValue, setValue] as const;
}
