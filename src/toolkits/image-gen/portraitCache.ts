/**
 * portraitCache — IndexedDB-backed cache for AI-generated agent portraits.
 *
 * Stores base64 image data keyed by agent ID + prompt hash so portraits
 * survive page reloads and aren't re-generated unnecessarily.
 */

const DB_NAME = "decops-portraits";
const DB_VERSION = 1;
const STORE_NAME = "portraits";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface CachedPortrait {
  /** base64-encoded image data (no data: prefix) */
  data: string;
  /** MIME type, e.g. "image/png" */
  mimeType: string;
  /** Prompt hash used to detect stale entries */
  promptHash: number;
  /** ISO timestamp */
  cachedAt: string;
}

/** Simple numeric hash for cache-busting when prompt changes */
export function promptHash(prompt: string): number {
  let h = 0;
  for (let i = 0; i < prompt.length; i++) {
    h = ((h << 5) - h + prompt.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Get a cached portrait for the given agent ID, or null if not found / stale */
export async function getCachedPortrait(
  agentId: string,
  currentPromptHash: number,
): Promise<CachedPortrait | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(agentId);
      req.onsuccess = () => {
        const entry = req.result as CachedPortrait | undefined;
        if (entry && entry.promptHash === currentPromptHash) {
          resolve(entry);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Store a generated portrait in the cache */
export async function setCachedPortrait(
  agentId: string,
  portrait: CachedPortrait,
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(portrait, agentId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Cache write failure is non-critical
  }
}

/** Remove a single portrait from cache (e.g. to regenerate) */
export async function removeCachedPortrait(agentId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(agentId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Non-critical
  }
}

/** Clear all cached portraits */
export async function clearPortraitCache(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Non-critical
  }
}
