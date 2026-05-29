/**
 * DIDComm DID + Secrets resolvers backed by local key material.
 *
 * The sicpa wasm DIDComm library doesn't ship any DID method resolvers —
 * callers must hand it `DIDDoc` and `Secret` objects. These resolvers
 * synthesise a minimal DID Doc from the local key store, so any DID we
 * have generated keys for becomes "resolvable" inside the library.
 *
 * Anyone we want to send to (peer agents on another browser) must have
 * registered their DID Doc via `registerExternalDIDDoc()`, which the
 * navigator/huddle handshake does over libp2p pubsub.
 */
import { getKeys, getOrCreateKeys, listKnownDIDs } from "./keys";

// `didcomm` ships .d.ts types; we don't import the wasm here to keep this
// module side-effect-free and easy to test.
type DIDDoc = {
  id: string;
  keyAgreement: string[];
  authentication: string[];
  verificationMethod: Array<{
    id: string;
    type: string;
    controller: string;
    publicKeyJwk?: unknown;
  }>;
  service: Array<{ id: string; type: string; serviceEndpoint: unknown }>;
};

type Secret = {
  id: string;
  type: string;
  privateKeyJwk?: unknown;
};

// External DID Docs (e.g. learned from a remote peer via pubsub handshake).
const externalDocs = new Map<string, DIDDoc>();

export function registerExternalDIDDoc(doc: DIDDoc): void {
  externalDocs.set(doc.id, doc);
}

export function listExternalDIDs(): string[] {
  return Array.from(externalDocs.keys());
}

function buildLocalDoc(did: string): DIDDoc | null {
  const km = getKeys(did);
  if (!km) return null;
  return {
    id: did,
    keyAgreement: [km.kaKid],
    authentication: [km.authKid],
    verificationMethod: [
      { id: km.authKid, type: "JsonWebKey2020", controller: did, publicKeyJwk: km.authPublicJwk },
      { id: km.kaKid, type: "JsonWebKey2020", controller: did, publicKeyJwk: km.kaPublicJwk },
    ],
    service: [],
  };
}

/** Returns the DID Doc that the underlying library will see. */
export function resolveDIDDoc(did: string): DIDDoc | null {
  return buildLocalDoc(did) ?? externalDocs.get(did) ?? null;
}

/**
 * DIDResolver implementation for the sicpa wasm DIDComm library. Resolves
 * any DID for which we hold local key material OR have been told about
 * via `registerExternalDIDDoc()`.
 */
export const didResolver = {
  async resolve(did: string): Promise<DIDDoc | null> {
    return resolveDIDDoc(did);
  },
};

/**
 * SecretsResolver implementation. Only ever returns secrets for DIDs we
 * own (i.e. have generated locally). Looks the secret up by kid first
 * (e.g. `did:x:abc#key-1`), falling back to a controller-DID match.
 */
export const secretsResolver = {
  async get_secret(secretId: string): Promise<Secret | null> {
    const did = secretId.split("#")[0];
    const km = getKeys(did);
    if (!km) return null;
    if (secretId === km.authKid) {
      return { id: km.authKid, type: "JsonWebKey2020", privateKeyJwk: km.authPrivateJwk };
    }
    if (secretId === km.kaKid) {
      return { id: km.kaKid, type: "JsonWebKey2020", privateKeyJwk: km.kaPrivateJwk };
    }
    return null;
  },
  async find_secrets(secretIds: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const sid of secretIds) {
      const did = sid.split("#")[0];
      const km = getKeys(did);
      if (!km) continue;
      if (sid === km.authKid || sid === km.kaKid) out.push(sid);
    }
    return out;
  },
};

/**
 * Convenience — ensure local key material exists for `did` and return its
 * (publishable) DID Doc, ready to be broadcast to peers.
 */
export function ensureLocalDoc(did: string): DIDDoc {
  getOrCreateKeys(did);
  const doc = buildLocalDoc(did);
  if (!doc) throw new Error(`Failed to build local DID Doc for ${did}`);
  return doc;
}

/** Diagnostics — which DIDs do we know about, local or external? */
export function knownDIDs(): { local: string[]; external: string[] } {
  return { local: listKnownDIDs(), external: listExternalDIDs() };
}
