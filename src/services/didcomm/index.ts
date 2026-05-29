/**
 * DIDComm v2 pack/unpack facade.
 *
 * Wraps the sicpa `didcomm` wasm package with the project's local
 * resolvers (`./resolvers`) and gives the rest of the app a small, stable
 * surface:
 *
 *   - {@link packEncrypted}  — auth-encrypt a plaintext message for `to`
 *   - {@link packAnon}       — anon-encrypt (no sender) for `to`
 *   - {@link unpack}         — decrypt / verify any incoming envelope
 *   - {@link buildMessage}   — helper to construct a DIDComm Plaintext
 *
 * The wasm binding loads lazily on first call so test setups that never
 * touch DIDComm don't pay the wasm cost.
 */
import { ensureLocalDoc, didResolver, secretsResolver, registerExternalDIDDoc } from "./resolvers";
import type { AgentKeyMaterial } from "./keys";
import { getOrCreateKeys } from "./keys";

// Lazy import — the wasm module performs top-level await on initialisation
// and we want to keep that cost off the synchronous boot path.
type DidcommModule = typeof import("didcomm");
let _mod: Promise<DidcommModule> | null = null;
function lib(): Promise<DidcommModule> {
  if (!_mod) _mod = import("didcomm");
  return _mod;
}

export interface BuildMessageInput {
  /** Sender DID (must be one we hold keys for). */
  from?: string;
  /** Recipient DID. */
  to: string;
  /** Protocol type URI, e.g. `https://decops.io/navigator/1.0/goal-propose`. */
  type: string;
  /** Application payload — must be JSON-serialisable. */
  body: unknown;
  /** Thread id (omit for new threads). */
  thid?: string;
  /** Parent thread id (for sub-threads / huddle sub-conversations). */
  pthid?: string;
  /** Optional extra headers. */
  extra?: Record<string, unknown>;
}

export interface PlaintextMessage {
  id: string;
  typ: string;
  type: string;
  body: unknown;
  from?: string;
  to?: string[];
  thid?: string;
  pthid?: string;
  created_time?: number;
  [k: string]: unknown;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function uuid(): string {
  return (globalThis.crypto && "randomUUID" in globalThis.crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Build a DIDComm Plaintext message ready to be handed to `packEncrypted`. */
export function buildPlaintext(input: BuildMessageInput): PlaintextMessage {
  return {
    id: uuid(),
    typ: "application/didcomm-plain+json",
    type: input.type,
    body: input.body,
    ...(input.from ? { from: input.from } : {}),
    to: [input.to],
    ...(input.thid ? { thid: input.thid } : {}),
    ...(input.pthid ? { pthid: input.pthid } : {}),
    created_time: nowSec(),
    ...(input.extra ?? {}),
  };
}

export interface PackedMessage {
  /** Compact JWE-shaped JSON string ready for the wire. */
  envelope: string;
  /** Plaintext id (== `thid` for thread roots) for local correlation. */
  messageId: string;
  /** Thread id (== messageId when not provided). */
  threadId: string;
}

async function toMessage(plain: PlaintextMessage) {
  const { Message } = await lib();
  return new Message(plain as unknown as ConstructorParameters<typeof Message>[0]);
}

/**
 * Authenticated encryption for `to`, sender = `from`. Requires that we
 * hold private keys for `from`. The recipient's DID Doc must be resolvable
 * (either local or registered via `registerExternalDIDDoc`).
 */
export async function packEncrypted(input: BuildMessageInput & { from: string }): Promise<PackedMessage> {
  // Ensure sender has keys (idempotent).
  ensureLocalDoc(input.from);
  const plain = buildPlaintext(input);
  const msg = await toMessage(plain);
  const [envelope] = await msg.pack_encrypted(
    input.to,
    input.from,
    null,
    didResolver,
    secretsResolver,
    { forward: false },
  );
  return {
    envelope,
    messageId: plain.id,
    threadId: plain.thid ?? plain.id,
  };
}

/** Anonymous encryption — no sender authentication. */
export async function packAnon(input: BuildMessageInput): Promise<PackedMessage> {
  const plain = buildPlaintext({ ...input, from: undefined });
  const msg = await toMessage(plain);
  const [envelope] = await msg.pack_encrypted(
    input.to,
    null,
    null,
    didResolver,
    secretsResolver,
    { forward: false },
  );
  return {
    envelope,
    messageId: plain.id,
    threadId: plain.thid ?? plain.id,
  };
}

export interface UnpackedMessage {
  plaintext: PlaintextMessage;
  /** Sender DID if the envelope was authenticated. */
  from?: string;
  /** Recipient(s) the envelope was addressed to. */
  to: string[];
  /** Whether the envelope was encrypted (vs. plaintext or signed-only). */
  encrypted: boolean;
  /** Whether sender authentication was verified. */
  authenticated: boolean;
}

/** Decrypt + verify any DIDComm envelope (encrypted, signed, or plaintext). */
export async function unpack(envelope: string): Promise<UnpackedMessage> {
  const { Message } = await lib();
  const [msg, meta] = await Message.unpack(
    envelope,
    didResolver,
    secretsResolver,
    {},
  );
  const plain = msg.as_value() as PlaintextMessage;
  return {
    plaintext: plain,
    from: plain.from,
    to: plain.to ?? [],
    encrypted: Boolean((meta as { encrypted?: boolean }).encrypted),
    authenticated: Boolean((meta as { authenticated?: boolean }).authenticated),
  };
}

// Re-exports — flat surface for callers.
export { getOrCreateKeys, registerExternalDIDDoc, ensureLocalDoc };
export type { AgentKeyMaterial };
