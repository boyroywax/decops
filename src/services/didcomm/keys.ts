/**
 * DIDComm key management.
 *
 * Per agent DID we generate one Ed25519 authentication keypair and one
 * X25519 keyAgreement keypair, encode them as JWKs, and persist them to
 * localStorage so they survive reloads. Private keys never leave the
 * browser. Public material is what gets surfaced in the DID Doc returned
 * by the `DIDResolver`.
 *
 * NB: this is local-trust material — sufficient for in-browser /
 * cross-browser p2p experiments. Production deployments would source
 * secrets from a real vault rather than localStorage.
 */
import { ed25519, x25519 } from "@noble/curves/ed25519.js";

export interface AgentKeyMaterial {
  /** The agent's controller DID. */
  did: string;
  /** DID URL of the Ed25519 authentication key (`<did>#key-1`). */
  authKid: string;
  /** DID URL of the X25519 key agreement key (`<did>#key-2`). */
  kaKid: string;
  /** Public JWK for the authentication key. */
  authPublicJwk: JsonWebKey;
  /** Public JWK for the key agreement key. */
  kaPublicJwk: JsonWebKey;
  /** Private JWK for the authentication key (kept local). */
  authPrivateJwk: JsonWebKey;
  /** Private JWK for the key agreement key (kept local). */
  kaPrivateJwk: JsonWebKey;
}

const STORAGE_KEY = "decops.didcomm.keys.v1";

function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function loadAll(): Record<string, AgentKeyMaterial> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AgentKeyMaterial>) : {};
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, AgentKeyMaterial>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* quota or unavailable — best effort only */
  }
}

function generate(did: string): AgentKeyMaterial {
  const authPriv = ed25519.utils.randomSecretKey();
  const authPub = ed25519.getPublicKey(authPriv);
  const kaPriv = x25519.utils.randomSecretKey();
  const kaPub = x25519.getPublicKey(kaPriv);
  return {
    did,
    authKid: `${did}#key-1`,
    kaKid: `${did}#key-2`,
    authPublicJwk: { kty: "OKP", crv: "Ed25519", x: b64u(authPub) },
    authPrivateJwk: { kty: "OKP", crv: "Ed25519", x: b64u(authPub), d: b64u(authPriv) },
    kaPublicJwk: { kty: "OKP", crv: "X25519", x: b64u(kaPub) },
    kaPrivateJwk: { kty: "OKP", crv: "X25519", x: b64u(kaPub), d: b64u(kaPriv) },
  };
}

/**
 * Returns the keys for `did`, generating + persisting them on first access.
 * Idempotent — repeated calls return the same material.
 */
export function getOrCreateKeys(did: string): AgentKeyMaterial {
  const all = loadAll();
  if (all[did]) return all[did];
  const km = generate(did);
  all[did] = km;
  saveAll(all);
  return km;
}

/** Lookup without auto-generation. */
export function getKeys(did: string): AgentKeyMaterial | undefined {
  return loadAll()[did];
}

/** Returns every DID for which we hold key material. */
export function listKnownDIDs(): string[] {
  return Object.keys(loadAll());
}

/** Replace material for a DID. Useful for tests and key rotation. */
export function setKeys(km: AgentKeyMaterial): void {
  const all = loadAll();
  all[km.did] = km;
  saveAll(all);
}

/** Drop material for a DID. */
export function deleteKeys(did: string): void {
  const all = loadAll();
  delete all[did];
  saveAll(all);
}
