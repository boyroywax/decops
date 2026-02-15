import { encryptData, decryptData } from '../../utils/secureStorage';
import type { DIDDocument } from '../../types';
import { DIDCreationResponse } from './types';

// Helper function to get existing or create a new local did:key (demo fallback only)
export async function getOrCreateLocalDIDKey(password: string): Promise<DIDCreationResponse | null> {
    // Check if we have a stored keypair
    // We look for the new encrypted keypair first
    const encryptedKeyPair = localStorage.getItem('user_encrypted_keypair');

    if (encryptedKeyPair) {
        try {
            // Decrypt the keypair
            const decryptedJson = await decryptData(encryptedKeyPair, password);
            const { publicKeyJwk } = JSON.parse(decryptedJson);

            // Reimport the public key to derive the DID
            const publicKey = await crypto.subtle.importKey(
                'jwk',
                publicKeyJwk,
                { name: 'Ed25519' },
                true,
                ['verify']
            );

            const publicKeyRaw = await crypto.subtle.exportKey('raw', publicKey);
            const publicKeyBytes = new Uint8Array(publicKeyRaw);

            // Recreate the DID from the stored key
            const multicodecPrefix = new Uint8Array([0xed, 0x01]);
            const multicodecKey = new Uint8Array(multicodecPrefix.length + publicKeyBytes.length);
            multicodecKey.set(multicodecPrefix);
            multicodecKey.set(publicKeyBytes, multicodecPrefix.length);

            const base58Key = base58Encode(multicodecKey);
            const did = `did:key:z${base58Key}`;

            const didDocument: DIDDocument = {
                id: did,
                controller: did,
                verificationMethod: [{
                    id: `${did}#key-1`,
                    type: 'Ed25519VerificationKey2020',
                    controller: did,
                    publicKeyMultibase: `z${base58Key}`,
                }],
                authentication: [`${did}#key-1`],
                assertionMethod: [`${did}#key-1`],
            };

            console.log('Unlocked existing DID from encrypted storage:', did);
            return { did, didDocument };
        } catch (error) {
            console.warn('Failed to unlock keypair:', error);
            throw error; // Re-throw to indicate password failure
        }
    }

    // Migration path: Check for old unencrypted keypair
    const oldKeyPair = localStorage.getItem('user_keypair');
    if (oldKeyPair) {
        console.log('Migrating old unencrypted keypair to encrypted storage...');
        try {
            // We have an old keypair, we should encrypt it with the provided password
            // and then remove the old one
            const keyData = JSON.parse(oldKeyPair);
            const encrypted = await encryptData(JSON.stringify(keyData), password);
            localStorage.setItem('user_encrypted_keypair', encrypted);
            localStorage.removeItem('user_keypair');

            // Now recurse to unlock it properly
            return getOrCreateLocalDIDKey(password);
        } catch (error) {
            console.error('Migration failed:', error);
        }
    }

    return null;
}

// Generate a new local did:key and persist the keypair
export async function generateAndPersistLocalDIDKey(password: string): Promise<DIDCreationResponse> {
    // Generate a keypair using Web Crypto API
    const keyPair = await crypto.subtle.generateKey(
        { name: 'Ed25519' },
        true,
        ['sign', 'verify']
    );

    // Export keys as JWK for storage
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

    const keyData = {
        privateKeyJwk,
        publicKeyJwk,
        createdAt: new Date().toISOString(),
    };

    // Encrypt the key data
    const encryptedData = await encryptData(JSON.stringify(keyData), password);

    // Store the encrypted keypair in localStorage
    localStorage.setItem('user_encrypted_keypair', encryptedData);

    // Clean up old insecure storage if it exists
    localStorage.removeItem('user_keypair');

    // Export the public key for DID generation
    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const publicKeyBytes = new Uint8Array(publicKeyRaw);

    // Create multibase-encoded multicodec public key (ed25519-pub = 0xed01)
    const multicodecPrefix = new Uint8Array([0xed, 0x01]);
    const multicodecKey = new Uint8Array(multicodecPrefix.length + publicKeyBytes.length);
    multicodecKey.set(multicodecPrefix);
    multicodecKey.set(publicKeyBytes, multicodecPrefix.length);

    // Base58btc encode with 'z' prefix for multibase
    const base58Key = base58Encode(multicodecKey);
    const did = `did:key:z${base58Key}`;

    const didDocument: DIDDocument = {
        id: did,
        controller: did,
        verificationMethod: [{
            id: `${did}#key-1`,
            type: 'Ed25519VerificationKey2020',
            controller: did,
            publicKeyMultibase: `z${base58Key}`,
        }],
        authentication: [`${did}#key-1`],
        assertionMethod: [`${did}#key-1`],
    };

    // Also persist the DID and document for quick access (these are public)
    localStorage.setItem('user_did', did);
    localStorage.setItem('user_did_document', JSON.stringify(didDocument));

    console.log('Generated and persisted new encrypted DID:', did);
    return { did, didDocument };
}

// Simple Base58 encoding (Bitcoin alphabet)
export function base58Encode(bytes: Uint8Array): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let result = '';
    let num = BigInt(0);

    for (const byte of bytes) {
        num = num * BigInt(256) + BigInt(byte);
    }

    while (num > 0) {
        result = ALPHABET[Number(num % BigInt(58))] + result;
        num = num / BigInt(58);
    }

    // Handle leading zeros
    for (const byte of bytes) {
        if (byte === 0) {
            result = '1' + result;
        } else {
            break;
        }
    }

    return result || '1';
}

// Generate a deterministic seed for DID creation
// In production, this should be derived from user's authentication or stored securely
export async function generateUserSeed(): Promise<string> {
    // Check if we already have a seed stored
    const existingSeed = localStorage.getItem('user_did_seed');
    if (existingSeed) {
        return existingSeed;
    }

    // Generate a random 32-character seed (required by Indy)
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);

    // Convert to base64 and take first 32 chars
    const base64 = btoa(String.fromCharCode(...randomBytes));
    const seed = base64.replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);

    // Pad if needed to ensure exactly 32 characters
    const paddedSeed = seed.padEnd(32, '0');

    // Store for future use (user keeps same DID)
    localStorage.setItem('user_did_seed', paddedSeed);

    return paddedSeed;
}
