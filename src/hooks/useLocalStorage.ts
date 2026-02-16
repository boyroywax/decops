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
                // Use functional setState so React always provides the latest state
                let serialized: string | null = null;
                setStoredValue((prev) => {
                    const valueToStore =
                        value instanceof Function ? value(prev) : value;

                    // Sync to localStorage immediately with the resolved value
                    if (typeof window !== "undefined") {
                        serialized = JSON.stringify(valueToStore);
                        window.localStorage.setItem(key, serialized);
                    }

                    return valueToStore;
                });
                // Dispatch sync event OUTSIDE the setState updater to avoid setState-during-setState
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
