import { useState, useEffect, useCallback, useRef } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
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
                setStoredValue((prev) => {
                    const valueToStore =
                        value instanceof Function ? value(prev) : value;

                    // Sync to localStorage immediately with the resolved value
                    if (typeof window !== "undefined") {
                        window.localStorage.setItem(key, JSON.stringify(valueToStore));
                        // Dispatch custom event for same-tab sync between hook instances
                        window.dispatchEvent(new CustomEvent('local-storage-sync', {
                            detail: { key, newValue: JSON.stringify(valueToStore) }
                        }));
                    }

                    return valueToStore;
                });
            } catch (error) {
                console.warn(`Error setting localStorage key "${key}":`, error);
            }
        },
        [key]
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
