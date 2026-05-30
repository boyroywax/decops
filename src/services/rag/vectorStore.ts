import { cosineSimilarity } from "./embeddings";

export interface RagVectorRecord {
  id: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  text: string;
  tags: string[];
  updatedAt: string;
  embedding: number[];
}

export interface RagVectorHit extends RagVectorRecord {
  score: number;
}

interface VectorQueryInput {
  workspaceId: string;
  embedding: number[];
  topK?: number;
  minScore?: number;
}

interface Vector5DbLike {
  upsert: (rows: Array<Record<string, unknown>>) => Promise<void>;
  query: (input: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
  remove: (input: Record<string, unknown>) => Promise<void>;
}

const STORAGE_KEY = "decops_rag_vectors_v1";

class LocalVectorStore {
  private records = new Map<string, RagVectorRecord>();
  private loaded = false;

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RagVectorRecord[];
      for (const row of parsed) this.records.set(row.id, row);
    } catch {
      // Ignore malformed cache; start clean.
    }
  }

  private persist(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.records.values())));
    } catch {
      // Ignore quota/storage errors.
    }
  }

  upsertMany(rows: RagVectorRecord[]): void {
    this.ensureLoaded();
    for (const row of rows) this.records.set(row.id, row);
    this.persist();
  }

  removeByWorkspace(workspaceId: string): void {
    this.ensureLoaded();
    for (const [id, row] of this.records.entries()) {
      if (row.workspaceId === workspaceId) this.records.delete(id);
    }
    this.persist();
  }

  search(input: VectorQueryInput): RagVectorHit[] {
    this.ensureLoaded();
    const topK = Math.max(1, Math.min(40, input.topK ?? 8));
    const minScore = typeof input.minScore === "number" ? input.minScore : 0.15;

    const hits: RagVectorHit[] = [];
    for (const row of this.records.values()) {
      if (row.workspaceId !== input.workspaceId) continue;
      const score = cosineSimilarity(input.embedding, row.embedding);
      if (score < minScore) continue;
      hits.push({ ...row, score });
    }

    return hits.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

class RagVectorStore {
  private local = new LocalVectorStore();
  private vector5db: Vector5DbLike | null = null;
  private initAttempted = false;

  private async ensureVector5Db(): Promise<Vector5DbLike | null> {
    if (this.initAttempted) return this.vector5db;
    this.initAttempted = true;

    if (typeof globalThis === "undefined") return null;

    try {
      // Optional dependency path: if vector5db exists, we use it.
      const moduleName: string = "vector5db";
      const dynamicModule = await import(/* @vite-ignore */ moduleName).catch(() => null);
      const candidate = (dynamicModule as { default?: unknown } | null)?.default;
      if (candidate && typeof candidate === "object") {
        this.vector5db = candidate as Vector5DbLike;
        return this.vector5db;
      }
    } catch {
      // Fall back to local store below.
    }

    const globalCandidate = (globalThis as { vector5db?: unknown }).vector5db;
    if (globalCandidate && typeof globalCandidate === "object") {
      this.vector5db = globalCandidate as Vector5DbLike;
      return this.vector5db;
    }

    return null;
  }

  async upsertMany(rows: RagVectorRecord[]): Promise<void> {
    if (rows.length === 0) return;

    const db = await this.ensureVector5Db();
    if (!db) {
      this.local.upsertMany(rows);
      return;
    }

    try {
      await db.upsert(rows.map((row) => ({ ...row })));
    } catch {
      this.local.upsertMany(rows);
    }
  }

  async removeByWorkspace(workspaceId: string): Promise<void> {
    const db = await this.ensureVector5Db();
    if (!db) {
      this.local.removeByWorkspace(workspaceId);
      return;
    }
    try {
      await db.remove({ workspaceId });
    } catch {
      this.local.removeByWorkspace(workspaceId);
    }
  }

  async search(input: VectorQueryInput): Promise<RagVectorHit[]> {
    const db = await this.ensureVector5Db();
    if (!db) return this.local.search(input);

    try {
      const rows = await db.query({
        workspaceId: input.workspaceId,
        embedding: input.embedding,
        topK: input.topK ?? 8,
      });

      const hits = rows
        .map((row) => ({
          ...(row as unknown as RagVectorRecord),
          score: Number((row as { score?: number }).score ?? 0),
        }))
        .filter((row) => Number.isFinite(row.score));

      return hits.sort((a, b) => b.score - a.score).slice(0, input.topK ?? 8);
    } catch {
      return this.local.search(input);
    }
  }
}

export const ragVectorStore = new RagVectorStore();
