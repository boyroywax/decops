/**
 * libp2p toolkit collections — contact book + encrypted identity vault.
 *
 * Two zustand-persisted collections:
 *
 *  • Contacts: a simple peer-id address book. Entries store a peer id,
 *    optional friendly name, optional default multiaddr, and free-form
 *    notes/tags. Persisted in plaintext in localStorage.
 *
 *  • Vault: encrypted libp2p identities (Ed25519 protobuf private keys).
 *    Each entry's `ciphertext` is AES-GCM-encrypted with a key derived
 *    from a user passphrase via PBKDF2-SHA256. Entries also remember the
 *    derived peer id so the UI can show identities without unlocking.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ── Crypto helpers ──────────────────────────────────────────────

const PBKDF2_ITERATIONS = 250_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function bytesToBase64(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}
function base64ToBytes(b64: string): Uint8Array {
    const raw = atob(b64.trim());
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(passphrase),
        "PBKDF2",
        false,
        ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt as unknown as ArrayBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256",
        },
        baseKey,
        { name: "AES-GCM", length: KEY_BYTES * 8 },
        false,
        ["encrypt", "decrypt"],
    );
}

/** Encrypt a base64 protobuf private key with a passphrase. */
export async function encryptIdentity(
    privateKeyBase64: string,
    passphrase: string,
): Promise<{ ciphertext: string; salt: string; iv: string }> {
    if (!passphrase) throw new Error("passphrase is required");
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(passphrase, salt);
    const plaintext = base64ToBytes(privateKeyBase64);
    const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
        key,
        plaintext as unknown as ArrayBuffer,
    );
    return {
        ciphertext: bytesToBase64(new Uint8Array(ct)),
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
    };
}

/** Decrypt a vault entry, returning the base64 private key. */
export async function decryptIdentity(
    entry: { ciphertext: string; salt: string; iv: string },
    passphrase: string,
): Promise<string> {
    if (!passphrase) throw new Error("passphrase is required");
    const salt = base64ToBytes(entry.salt);
    const iv = base64ToBytes(entry.iv);
    const key = await deriveKey(passphrase, salt);
    try {
        const pt = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
            key,
            base64ToBytes(entry.ciphertext) as unknown as ArrayBuffer,
        );
        return bytesToBase64(new Uint8Array(pt));
    } catch {
        throw new Error("Decryption failed — wrong passphrase or corrupt entry");
    }
}

// ── Types ───────────────────────────────────────────────────────

export interface Contact {
    /** Local id (uuid). */
    id: string;
    /** Friendly display name. Optional but encouraged. */
    name?: string;
    /** libp2p peer id (CID, base58). */
    peerId: string;
    /** Optional default multiaddr to dial. */
    multiaddr?: string;
    /** Optional free-form notes. */
    notes?: string;
    /** Free-form tags. */
    tags?: string[];
    createdAt: string;
    updatedAt: string;
}

export interface VaultEntry {
    /** Local id (uuid). */
    id: string;
    /** Friendly label (e.g. "Operator key"). */
    label: string;
    /** Derived peer id — visible without unlocking. */
    peerId: string;
    /** AES-GCM ciphertext (base64) of the protobuf private key. */
    ciphertext: string;
    /** Random salt for PBKDF2 (base64). */
    salt: string;
    /** Random IV for AES-GCM (base64). */
    iv: string;
    /** PBKDF2 iteration count, recorded for forward compatibility. */
    iterations: number;
    /** Optional notes (plaintext). */
    notes?: string;
    createdAt: string;
}

export interface PnetEntry {
    /** Local id (uuid). */
    id: string;
    /** Friendly label (e.g. "Internal swarm"). */
    label: string;
    /** Optional fingerprint of the pnet key (sha256 of the 32-byte secret, base64). Visible without unlocking. */
    fingerprint?: string;
    /** AES-GCM ciphertext (base64) of the go-libp2p PSK v1 ascii document. */
    ciphertext: string;
    /** Random salt for PBKDF2 (base64). */
    salt: string;
    /** Random IV for AES-GCM (base64). */
    iv: string;
    /** PBKDF2 iteration count. */
    iterations: number;
    /** Optional notes (plaintext). */
    notes?: string;
    createdAt: string;
}

// ── Store ───────────────────────────────────────────────────────

interface CollectionsState {
    contacts: Contact[];
    vault: VaultEntry[];
    networks: PnetEntry[];
}

interface CollectionsActions {
    addContact: (contact: Omit<Contact, "id" | "createdAt" | "updatedAt"> & Partial<Pick<Contact, "id">>) => Contact;
    updateContact: (id: string, patch: Partial<Omit<Contact, "id" | "createdAt">>) => void;
    removeContact: (id: string) => void;
    clearContacts: () => void;

    addVaultEntry: (entry: Omit<VaultEntry, "id" | "createdAt" | "iterations"> & Partial<Pick<VaultEntry, "id">>) => VaultEntry;
    updateVaultEntry: (id: string, patch: Partial<Omit<VaultEntry, "id" | "createdAt">>) => void;
    removeVaultEntry: (id: string) => void;
    clearVault: () => void;

    addPnetEntry: (entry: Omit<PnetEntry, "id" | "createdAt" | "iterations"> & Partial<Pick<PnetEntry, "id">>) => PnetEntry;
    updatePnetEntry: (id: string, patch: Partial<Omit<PnetEntry, "id" | "createdAt">>) => void;
    removePnetEntry: (id: string) => void;
    clearPnet: () => void;
}

export type CollectionsStore = CollectionsState & CollectionsActions;

function nowIso() { return new Date().toISOString(); }
function uuid() { return crypto.randomUUID(); }

export const useLibp2pCollections = create<CollectionsStore>()(
    persist(
        (set) => ({
            contacts: [],
            vault: [],
            networks: [],

            addContact: (input) => {
                const c: Contact = {
                    id: input.id ?? uuid(),
                    name: input.name,
                    peerId: input.peerId,
                    multiaddr: input.multiaddr,
                    notes: input.notes,
                    tags: input.tags,
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                };
                set((state) => ({ contacts: [...state.contacts, c] }));
                return c;
            },
            updateContact: (id, patch) =>
                set((state) => ({
                    contacts: state.contacts.map((c) =>
                        c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c,
                    ),
                })),
            removeContact: (id) =>
                set((state) => ({ contacts: state.contacts.filter((c) => c.id !== id) })),
            clearContacts: () => set({ contacts: [] }),

            addVaultEntry: (input) => {
                const v: VaultEntry = {
                    id: input.id ?? uuid(),
                    label: input.label,
                    peerId: input.peerId,
                    ciphertext: input.ciphertext,
                    salt: input.salt,
                    iv: input.iv,
                    iterations: PBKDF2_ITERATIONS,
                    notes: input.notes,
                    createdAt: nowIso(),
                };
                set((state) => ({ vault: [...state.vault, v] }));
                return v;
            },
            updateVaultEntry: (id, patch) =>
                set((state) => ({
                    vault: state.vault.map((v) => (v.id === id ? { ...v, ...patch } : v)),
                })),
            removeVaultEntry: (id) =>
                set((state) => ({ vault: state.vault.filter((v) => v.id !== id) })),
            clearVault: () => set({ vault: [] }),

            addPnetEntry: (input) => {
                const e: PnetEntry = {
                    id: input.id ?? uuid(),
                    label: input.label,
                    fingerprint: input.fingerprint,
                    ciphertext: input.ciphertext,
                    salt: input.salt,
                    iv: input.iv,
                    iterations: PBKDF2_ITERATIONS,
                    notes: input.notes,
                    createdAt: nowIso(),
                };
                set((state) => ({ networks: [...state.networks, e] }));
                return e;
            },
            updatePnetEntry: (id, patch) =>
                set((state) => ({
                    networks: state.networks.map((n) => (n.id === id ? { ...n, ...patch } : n)),
                })),
            removePnetEntry: (id) =>
                set((state) => ({ networks: state.networks.filter((n) => n.id !== id) })),
            clearPnet: () => set({ networks: [] }),
        }),
        {
            name: "decops:libp2p-collections",
            storage: createJSONStorage(() => localStorage),
            version: 2,
        },
    ),
);

/** Look up a vault entry by id (throws if missing). */
export function getVaultEntry(id: string): VaultEntry {
    const entry = useLibp2pCollections.getState().vault.find((v) => v.id === id);
    if (!entry) throw new Error(`Vault entry "${id}" not found`);
    return entry;
}

/** Look up a contact by id (throws if missing). */
export function getContact(id: string): Contact {
    const c = useLibp2pCollections.getState().contacts.find((x) => x.id === id);
    if (!c) throw new Error(`Contact "${id}" not found`);
    return c;
}

// ── Private-network (pnet) helpers ─────────────────────

/** Generate a fresh 32-byte libp2p PSK and return its go-libp2p ascii document. */
export function generatePnetKey(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    let hex = "";
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
    return `/key/swarm/psk/1.0.0/\n/base16/\n${hex}`;
}

/** Validate and normalise a pasted pnet ascii document. Throws on bad input. */
export function normalisePnetKey(text: string): string {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/key/swarm/psk/1.0.0/")) {
        throw new Error("Not a valid libp2p PSK document (expected /key/swarm/psk/1.0.0/ header)");
    }
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) throw new Error("PSK document is truncated");
    const encoding = lines[1];
    const body = lines.slice(2).join("");
    if (encoding === "/base16/") {
        if (!/^[0-9a-fA-F]{64}$/.test(body)) throw new Error("PSK base16 body must be 64 hex chars");
    } else if (encoding === "/base64/") {
        try { atob(body); } catch { throw new Error("PSK base64 body is malformed"); }
    } else {
        throw new Error(`Unsupported PSK encoding "${encoding}"`);
    }
    return `${lines[0]}\n${lines[1]}\n${body}`;
}

/** Compute a fingerprint (base64 sha256 of the 32-byte secret) for display. */
export async function fingerprintPnetKey(asciiKey: string): Promise<string> {
    const lines = asciiKey.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const encoding = lines[1];
    const body = lines.slice(2).join("");
    let raw: Uint8Array;
    if (encoding === "/base16/") {
        raw = new Uint8Array(32);
        for (let i = 0; i < 32; i++) raw[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
    } else {
        raw = base64ToBytes(body);
    }
    const digest = await crypto.subtle.digest("SHA-256", raw as unknown as ArrayBuffer);
    return bytesToBase64(new Uint8Array(digest)).slice(0, 12);
}

/** Encrypt the ASCII pnet document with a passphrase. */
export async function encryptPnetKey(
    asciiKey: string,
    passphrase: string,
): Promise<{ ciphertext: string; salt: string; iv: string }> {
    if (!passphrase) throw new Error("passphrase is required");
    const enc = new TextEncoder();
    const plaintext = enc.encode(asciiKey);
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(passphrase, salt);
    const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
        key,
        plaintext as unknown as ArrayBuffer,
    );
    return {
        ciphertext: bytesToBase64(new Uint8Array(ct)),
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
    };
}

/** Decrypt a pnet entry, returning the ASCII PSK document. */
export async function decryptPnetKey(
    entry: { ciphertext: string; salt: string; iv: string },
    passphrase: string,
): Promise<string> {
    if (!passphrase) throw new Error("passphrase is required");
    const salt = base64ToBytes(entry.salt);
    const iv = base64ToBytes(entry.iv);
    const key = await deriveKey(passphrase, salt);
    try {
        const pt = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
            key,
            base64ToBytes(entry.ciphertext) as unknown as ArrayBuffer,
        );
        return new TextDecoder().decode(pt);
    } catch {
        throw new Error("Decryption failed \u2014 wrong passphrase or corrupt entry");
    }
}

/** Look up a pnet entry by id (throws if missing). */
export function getPnetEntry(id: string): PnetEntry {
    const entry = useLibp2pCollections.getState().networks.find((n) => n.id === id);
    if (!entry) throw new Error(`Network entry "${id}" not found`);
    return entry;
}
