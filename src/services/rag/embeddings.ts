const EMBEDDING_DIM = 192;

function tokenize(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function hashToken(token: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function normalize(vector: number[]): number[] {
  let norm = 0;
  for (const v of vector) norm += v * v;
  if (norm <= 0) return vector;
  const denom = Math.sqrt(norm);
  return vector.map((v) => v / denom);
}

/**
 * Deterministic local embedding for client-side retrieval.
 *
 * This is intentionally lightweight and on-device so indexing never blocks
 * on network calls. The interface is async so it can be replaced later with
 * a remote embedding provider without touching call sites.
 */
export async function embedText(text: string): Promise<number[]> {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vector;

  for (const token of tokens) {
    const h = hashToken(token);
    const idx = h % EMBEDDING_DIM;
    const sign = ((h >>> 1) & 1) === 0 ? 1 : -1;
    const weight = 1 + ((h >>> 8) % 3) * 0.25;
    vector[idx] += sign * weight;
  }

  return normalize(vector);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}
