/**
 * Secure storage utility using Web Crypto API
 * Uses PBKDF2 for key derivation and AES-GCM for encryption
 */

// Configuration for encryption
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

interface EncryptedData {
    ciphertext: string; // Base64 encoded
    salt: string;       // Base64 encoded
    iv: string;         // Base64 encoded
}

/**
 * Derives a cryptographic key from a password
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password) as unknown as BufferSource,
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt as unknown as BufferSource,
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: KEY_LENGTH },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * Encrypts data with a password
 */
export async function encryptData(data: string, password: string): Promise<string> {
    const enc = new TextEncoder();
    const encodedData = enc.encode(data);

    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Derive key
    const key = await deriveKey(password, salt);

    // Encrypt
    const encryptedContent = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv as unknown as BufferSource
        },
        key,
        encodedData as unknown as BufferSource
    );

    // Pack everything into a JSON object
    const result: EncryptedData = {
        ciphertext: arrayBufferToBase64(encryptedContent),
        salt: uint8ArrayToBase64(salt),
        iv: uint8ArrayToBase64(iv)
    };

    return JSON.stringify(result);
}

/**
 * Decrypts data with a password
 */
export async function decryptData(encryptedJson: string, password: string): Promise<string> {
    try {
        const data: EncryptedData = JSON.parse(encryptedJson);

        const salt = base64ToUint8Array(data.salt);
        const iv = base64ToUint8Array(data.iv);
        const ciphertext = base64ToArrayBuffer(data.ciphertext);

        // Derive key
        const key = await deriveKey(password, salt);

        // Decrypt
        const decryptedContent = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv as unknown as BufferSource
            },
            key,
            ciphertext as unknown as BufferSource
        );

        const dec = new TextDecoder();
        return dec.decode(decryptedContent);
    } catch (error) {
        console.error("Decryption failed:", error);
        throw new Error("Invalid password or corrupted data");
    }
}

// Helpers for Base64 conversion
function arrayBufferToBase64(buffer: ArrayBufferLike): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    return arrayBufferToBase64(bytes.buffer);
}

function base64ToUint8Array(base64: string): Uint8Array {
    return new Uint8Array(base64ToArrayBuffer(base64));
}
