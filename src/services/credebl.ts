import api from '../api/client';
import { encryptPassword } from '../utils/crypto';
import type {
    ApiResponse,
    User,
    DIDDocument,
    VerifiableCredential,
    CredentialOffer,
    VerificationRequest,
    ProofRequest,
    Connection,
    Schema,
    CredentialDefinition,
    EmailRegistrationCredential,
    AgentType,
    OrgAgentConfig,
    EmailOTPRequest,
    EmailOTPVerification,
    EmailValidation,
} from '../types';

const ORG_ID = import.meta.env.VITE_CREDEBL_ORG_ID || '';
const ORG_DID = import.meta.env.VITE_CREDEBL_ORG_DID || '';
const EMAIL_CRED_DEF_ID = import.meta.env.VITE_EMAIL_CREDENTIAL_DEF_ID || '';

// Agent Configuration - supports both dedicated and shared agents
const ISSUER_AGENT_TYPE: AgentType = (import.meta.env.VITE_ISSUER_AGENT_TYPE as AgentType) || 'DEDICATED';
const ISSUER_AGENT_ORG_ID = import.meta.env.VITE_ISSUER_AGENT_ORG_ID || ORG_ID;
const USER_AGENT_TYPE: AgentType = (import.meta.env.VITE_USER_AGENT_TYPE as AgentType) || 'SHARED';

// CREDEBL API Response wrapper
interface CredeblResponse<T> {
    statusCode: number;
    message: string;
    data: T;
}

// Login response type
interface LoginResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    sessionId: string;
}

// Signup request type
interface SignupRequest {
    email: string;
    firstName?: string;
    lastName?: string;
    password: string;
    isPasskey?: boolean;
}

// User profile response type
interface UserProfile {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isEmailVerified: boolean;
}

// DID creation response
interface DIDCreationResponse {
    did: string;
    didDocument: DIDDocument;
    verkey?: string;
}

// OOB Credential Offer response
interface OOBCredentialOfferResponse {
    invitationUrl: string;
    credentialOfferUri?: string;
    state: string;
}

// Authentication Services
export const authService = {
    // Login with email and password
    async login(email: string, password: string): Promise<CredeblResponse<LoginResponse>> {
        const encryptedPassword = encryptPassword(password);
        const response = await api.post<CredeblResponse<LoginResponse>>('/v1/auth/signin', {
            email,
            password: encryptedPassword,
        });

        // Store tokens on successful login
        if (response.data.statusCode === 200) {
            localStorage.setItem('access_token', response.data.data.access_token);
            localStorage.setItem('refresh_token', response.data.data.refresh_token);
            localStorage.setItem('session_id', response.data.data.sessionId);
        }

        return response.data;
    },

    // Step 1 of signup: Send verification email
    async sendVerificationEmail(email: string): Promise<ApiResponse<{ sent: boolean }>> {
        try {
            const response = await api.post<CredeblResponse<unknown>>('/v1/auth/verification-mail', {
                email,
            });

            return {
                success: response.data.statusCode === 200 || response.data.statusCode === 201,
                data: { sent: true },
                message: response.data.message,
            };
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            return {
                success: false,
                error: err.response?.data?.message || 'Failed to send verification email',
            };
        }
    },

    // Step 2 of signup: Complete registration after email verification
    async signup(signupData: SignupRequest): Promise<ApiResponse<{ userId: string }>> {
        try {
            const encryptedPassword = encryptPassword(signupData.password);
            const response = await api.post<CredeblResponse<{ userId: string }>>('/v1/auth/signup', {
                email: signupData.email,
                firstName: signupData.firstName || '',
                lastName: signupData.lastName || '',
                password: encryptedPassword,
                isPasskey: signupData.isPasskey || false,
            });

            if (response.data.statusCode === 200 || response.data.statusCode === 201) {
                return {
                    success: true,
                    data: response.data.data,
                    message: response.data.message,
                };
            }

            return {
                success: false,
                error: response.data.message || 'Signup failed',
            };
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            return {
                success: false,
                error: err.response?.data?.message || 'Signup failed',
            };
        }
    },

    // Check if user already exists
    async checkUserExists(email: string): Promise<ApiResponse<{ exists: boolean; isEmailVerified: boolean }>> {
        try {
            const response = await api.get<CredeblResponse<{ isRegistered: boolean; isEmailVerified: boolean }>>(
                `/v1/users/${encodeURIComponent(email)}`
            );

            return {
                success: true,
                data: {
                    exists: response.data.data?.isRegistered || false,
                    isEmailVerified: response.data.data?.isEmailVerified || false,
                },
            };
        } catch (error) {
            // 404 means user doesn't exist
            const status = (error as { response?: { status: number } }).response?.status;
            if (status === 404) {
                return {
                    success: true,
                    data: { exists: false, isEmailVerified: false },
                };
            }
            return {
                success: false,
                error: 'Failed to check user existence',
            };
        }
    },

    // Forgot password - sends reset link to email
    async forgotPassword(email: string): Promise<ApiResponse<{ sent: boolean }>> {
        try {
            const response = await api.post<CredeblResponse<unknown>>('/v1/auth/forgot-password', {
                email,
            });

            return {
                success: response.data.statusCode === 200 || response.data.statusCode === 201,
                data: { sent: true },
                message: response.data.message,
            };
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            return {
                success: false,
                error: err.response?.data?.message || 'Failed to send password reset email',
            };
        }
    },

    // Reset password with token (from email link)
    async resetPasswordWithToken(
        email: string,
        token: string,
        newPassword: string
    ): Promise<ApiResponse<{ reset: boolean }>> {
        try {
            const encryptedPassword = encryptPassword(newPassword);
            const response = await api.post<CredeblResponse<unknown>>(`/v1/auth/password-reset/${encodeURIComponent(email)}`, {
                token,
                password: encryptedPassword,
            });

            return {
                success: response.data.statusCode === 200 || response.data.statusCode === 201,
                data: { reset: true },
                message: response.data.message,
            };
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            return {
                success: false,
                error: err.response?.data?.message || 'Failed to reset password',
            };
        }
    },

    // Reset password with current password
    async resetPassword(
        email: string,
        oldPassword: string,
        newPassword: string
    ): Promise<ApiResponse<{ reset: boolean }>> {
        try {
            const encryptedOldPassword = encryptPassword(oldPassword);
            const encryptedNewPassword = encryptPassword(newPassword);
            const response = await api.post<CredeblResponse<unknown>>('/v1/auth/reset-password', {
                email,
                oldPassword: encryptedOldPassword,
                newPassword: encryptedNewPassword,
            });

            return {
                success: response.data.statusCode === 200 || response.data.statusCode === 201,
                data: { reset: true },
                message: response.data.message,
            };
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            return {
                success: false,
                error: err.response?.data?.message || 'Failed to reset password',
            };
        }
    },

    // Login with DID (placeholder - needs DID wallet integration)
    async loginWithDID(did: string, signature: string): Promise<ApiResponse<{ user: User; token: string }>> {
        // const response = await api.post('/v1/auth/did/login', { did, signature });
        // return response.data;
        // Placeholder to match expected AuthContext behavior for now
        // The Reference code had this but it returns 'any'. I will mock it to satisfy types for now
        // or implement if endpoint exists.
        console.warn("DID Login not fully implemented");
        return { success: false, error: "Not implemented" };
    },

    // Register/Create new DID for the user
    // CREDEBL supports multiple DID methods: did:indy, did:polygon, did:key, did:web
    // The DID is created via the organization's agent on the configured ledger
    async registerDID(method: string = 'indy'): Promise<ApiResponse<DIDCreationResponse>> {
        // First check if we already have a stored DID for this user
        const existingDid = localStorage.getItem('user_did');
        const existingDidDocument = localStorage.getItem('user_did_document');

        if (existingDid && existingDidDocument) {
            console.log('Using existing DID:', existingDid);
            return {
                success: true,
                data: {
                    did: existingDid,
                    didDocument: JSON.parse(existingDidDocument),
                },
            };
        }

        // Get configured DID method from environment or use default
        const didMethod = import.meta.env.VITE_DID_METHOD || method;
        const didNetwork = import.meta.env.VITE_DID_NETWORK || 'bcovrin:testnet'; // e.g., 'polygon:mainnet', 'indicio:testnet'

        try {
            // CREDEBL creates DIDs via the organization's agent
            // Endpoint: POST /orgs/:orgId/agents/did
            const createDidPayload: {
                method: string;
                keyType: string;
                seed?: string;
                network?: string;
                privatekey?: string;
                isPrimaryDid?: boolean;
            } = {
                method: didMethod, // 'indy', 'polygon', 'key', 'web'
                keyType: 'ed25519',
                isPrimaryDid: false, // User DIDs are not primary org DIDs
            };

            // For Indy/Key/Web DIDs, a seed is required
            if (['indy', 'key', 'web'].includes(didMethod)) {
                // Generate a deterministic seed from user's session or create random
                createDidPayload.seed = await generateUserSeed();
                if (didMethod === 'indy') {
                    createDidPayload.network = didNetwork;
                }
            }

            // For Polygon DIDs, need to create keys first or provide private key
            if (didMethod === 'polygon') {
                // First create Secp256k1 keys for Polygon
                try {
                    const keysResponse = await api.post<CredeblResponse<{ privateKey: string; publicKey: string }>>(
                        `/v1/orgs/${ORG_ID}/agents/polygon/create-keys`
                    );
                    if (keysResponse.data.data?.privateKey) {
                        createDidPayload.privatekey = keysResponse.data.data.privateKey;
                        createDidPayload.network = didNetwork; // e.g., 'polygon:mainnet' or 'polygon:testnet'
                    }
                } catch (keyError) {
                    console.error('Failed to create Polygon keys:', keyError);
                    throw keyError;
                }
            }

            console.log(`Creating ${didMethod.toUpperCase()} DID on network: ${didNetwork}`);

            const response = await api.post<CredeblResponse<{
                did: string;
                didDocument: DIDDocument;
                verkey?: string;
            }>>(`/v1/orgs/${ORG_ID}/agents/did`, createDidPayload);

            if (response.data.statusCode === 200 || response.data.statusCode === 201) {
                const { did, didDocument } = response.data.data;

                // Persist the DID
                localStorage.setItem('user_did', did);
                localStorage.setItem('user_did_document', JSON.stringify(didDocument));

                console.log(`Created ${didMethod} DID:`, did);

                return {
                    success: true,
                    data: response.data.data,
                };
            }

            throw new Error(response.data.message || 'Failed to create DID');
        } catch (error) {
            console.error('Failed to create DID via CREDEBL agent:', error);

            // Fallback to local did:key for demo purposes only
            // This is NOT a real decentralized identifier - just for testing UI
            console.warn('⚠️ Falling back to local did:key (demo mode only - not registered on any ledger)');
            const localDid = await getOrCreateLocalDIDKey();

            return {
                success: true,
                data: localDid,
                message: 'Using local did:key (demo mode - not on ledger)',
            };
        }
    },

    // Verify DID ownership
    async verifyDID(did: string): Promise<ApiResponse<{ verified: boolean; didDocument: DIDDocument }>> {
        const response = await api.get(`/v1/auth/did/verify/${encodeURIComponent(did)}`);
        return response.data;
    },

    // Get current user profile
    async getProfile(): Promise<CredeblResponse<UserProfile>> {
        const response = await api.get<CredeblResponse<UserProfile>>('/v1/users/profile');
        return response.data;
    },

    // Logout
    async logout(): Promise<void> {
        try {
            await api.post('/v1/auth/logout');
        } catch (error) {
            // Ignore logout errors
        }
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('session_id');
        localStorage.removeItem('user');
        localStorage.removeItem('user_did');
    },
};

// Generate a deterministic seed for DID creation
// In production, this should be derived from user's authentication or stored securely
async function generateUserSeed(): Promise<string> {
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

// Helper function to get existing or create a new local did:key (demo fallback only)
async function getOrCreateLocalDIDKey(): Promise<DIDCreationResponse> {
    // Check if we have a stored keypair
    const storedKeyPair = localStorage.getItem('user_keypair');

    if (storedKeyPair) {
        try {
            const { publicKeyJwk } = JSON.parse(storedKeyPair);

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

            console.log('Restored existing DID from stored keypair:', did);
            return { did, didDocument };
        } catch (error) {
            console.warn('Failed to restore keypair, generating new one:', error);
            // Fall through to generate new keypair
        }
    }

    // Generate new keypair and persist it
    return generateAndPersistLocalDIDKey();
}

// Generate a new local did:key and persist the keypair
async function generateAndPersistLocalDIDKey(): Promise<DIDCreationResponse> {
    // Generate a keypair using Web Crypto API
    const keyPair = await crypto.subtle.generateKey(
        { name: 'Ed25519' },
        true,
        ['sign', 'verify']
    );

    // Export keys as JWK for storage
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

    // Store the keypair securely in localStorage
    // Note: In production, consider using IndexedDB with encryption or a secure enclave
    localStorage.setItem('user_keypair', JSON.stringify({
        privateKeyJwk,
        publicKeyJwk,
        createdAt: new Date().toISOString(),
    }));

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

    // Also persist the DID and document for quick access
    localStorage.setItem('user_did', did);
    localStorage.setItem('user_did_document', JSON.stringify(didDocument));

    console.log('Generated and persisted new DID:', did);
    return { did, didDocument };
}

// Simple Base58 encoding (Bitcoin alphabet)
function base58Encode(bytes: Uint8Array): string {
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

// Email Registration Credential Service
// Issues a verifiable credential to users proving they registered their email with Pocket Labs
export const emailRegistrationService = {
    // Issue email registration credential to a user
    // This uses CREDEBL's Out-of-Band (OOB) credential offer via email
    async issueEmailRegistrationCredential(
        userEmail: string,
        userDid: string
    ): Promise<ApiResponse<{ offerSent: boolean; credentialOfferUri?: string }>> {
        try {
            // Try the OOB email issuance endpoint (connectionless credential offer)
            const credentialOffer = {
                emailId: userEmail,
                attributes: [
                    { name: 'email', value: userEmail },
                    { name: 'registrationDate', value: new Date().toISOString() },
                    { name: 'serviceName', value: 'Pocket Labs Identity Service' },
                    { name: 'serviceProvider', value: 'Pocket Labs' },
                    { name: 'holderDid', value: userDid },
                ],
                credential: {
                    '@context': [
                        'https://www.w3.org/2018/credentials/v1',
                        'https://w3id.org/security/suites/ed25519-2020/v1',
                    ],
                    type: ['VerifiableCredential', 'EmailRegistrationCredential'],
                    issuer: {
                        id: ORG_DID || 'did:key:placeholder',
                        name: 'Pocket Labs',
                    },
                    issuanceDate: new Date().toISOString(),
                    credentialSubject: {
                        id: userDid,
                        email: userEmail,
                        registrationDate: new Date().toISOString(),
                        serviceName: 'Pocket Labs Identity Service',
                        serviceProvider: 'Pocket Labs',
                    },
                },
            };

            // CREDEBL OOB email issuance endpoint
            const response = await api.post<CredeblResponse<OOBCredentialOfferResponse>>(
                `/v1/orgs/${ORG_ID}/credentials/oob/email`,
                {
                    credentialDefinitionId: EMAIL_CRED_DEF_ID,
                    credentialOffer: [credentialOffer],
                    comment: 'Email Registration Credential from Pocket Labs',
                    protocolVersion: 'v2',
                    credentialType: 'jsonld', // W3C JSON-LD format
                }
            );

            return {
                success: response.data.statusCode === 200 || response.data.statusCode === 201,
                data: {
                    offerSent: true,
                    credentialOfferUri: response.data.data?.credentialOfferUri,
                },
            };
        } catch (error) {
            console.warn('OOB email issuance not available, trying OID4VCI flow...');

            // Fallback: Try OID4VCI credential offer (if issuer is configured)
            try {
                return await this.issueViaOID4VCI(userEmail, userDid);
            } catch (oid4vcError) {
                console.warn('OID4VCI issuance not available, storing locally...');

                // Store credential locally as a placeholder (demo mode)
                const localCredential = this.createLocalEmailCredential(userEmail, userDid);
                this.storeLocalCredential(localCredential);

                return {
                    success: true,
                    data: {
                        offerSent: false, // No email sent, stored locally
                        credentialOfferUri: undefined,
                    },
                    message: 'Credential stored locally (demo mode)',
                };
            }
        }
    },

    // Issue via OID4VCI (OpenID for Verifiable Credential Issuance)
    async issueViaOID4VCI(
        userEmail: string,
        userDid: string
    ): Promise<ApiResponse<{ offerSent: boolean; credentialOfferUri?: string }>> {
        const issuerId = import.meta.env.VITE_CREDEBL_ISSUER_ID || '';
        const templateId = import.meta.env.VITE_EMAIL_TEMPLATE_ID || '';

        if (!issuerId || !templateId) {
            throw new Error('OID4VCI issuer or template not configured');
        }

        const response = await api.post<CredeblResponse<{ credentialOfferUri: string }>>(
            `/v1/orgs/${ORG_ID}/oid4vc/${issuerId}/credential-offer`,
            {
                credentials: [
                    {
                        templateId,
                        payload: {
                            email: userEmail,
                            holderDid: userDid,
                            registrationDate: new Date().toISOString(),
                            serviceName: 'Pocket Labs Identity Service',
                            serviceProvider: 'Pocket Labs',
                        },
                    },
                ],
                authorizationType: 'preAuthorizedCodeFlow',
            }
        );

        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
            data: {
                offerSent: true,
                credentialOfferUri: response.data.data?.credentialOfferUri,
            },
        };
    },

    // Create a local email registration credential (for demo/offline mode)
    createLocalEmailCredential(userEmail: string, userDid: string): EmailRegistrationCredential {
        const now = new Date().toISOString();
        const credentialId = `urn:uuid:${crypto.randomUUID()}`;

        return {
            '@context': [
                'https://www.w3.org/2018/credentials/v1',
                'https://w3id.org/security/suites/ed25519-2020/v1',
            ],
            id: credentialId,
            type: ['VerifiableCredential', 'EmailRegistrationCredential'],
            issuer: {
                id: ORG_DID || 'did:web:pocketlabs.io',
                name: 'Pocket Labs',
            },
            issuanceDate: now,
            credentialSubject: {
                id: userDid,
                email: userEmail,
                registrationDate: now,
                serviceName: 'Pocket Labs Identity Service',
                serviceProvider: 'Pocket Labs',
            },
        };
    },

    // Store credential in local storage (for demo purposes)
    storeLocalCredential(credential: EmailRegistrationCredential): void {
        const stored = localStorage.getItem('local_credentials');
        const credentials: EmailRegistrationCredential[] = stored ? JSON.parse(stored) : [];

        // Avoid duplicates
        if (!credentials.find(c => c.credentialSubject.email === credential.credentialSubject.email)) {
            credentials.push(credential);
            localStorage.setItem('local_credentials', JSON.stringify(credentials));
        }
    },

    // Get locally stored credentials
    getLocalCredentials(): EmailRegistrationCredential[] {
        const stored = localStorage.getItem('local_credentials');
        return stored ? JSON.parse(stored) : [];
    },

    // Check if user already has an email registration credential
    async hasEmailRegistrationCredential(userEmail: string): Promise<boolean> {
        // Check local storage first
        const localCreds = this.getLocalCredentials();
        if (localCreds.some(c => c.credentialSubject.email === userEmail)) {
            return true;
        }

        // Check CREDEBL credentials
        try {
            const response = await credentialService.getCredentials();
            if (response.success && response.data) {
                return response.data.some(cred =>
                    cred.type.includes('EmailRegistrationCredential') &&
                    cred.credentialSubject?.email === userEmail
                );
            }
        } catch {
            // Ignore errors
        }

        return false;
    },
};

// Credential Services
export const credentialService = {
    // Get all credentials for the user/org
    async getCredentials(): Promise<ApiResponse<VerifiableCredential[]>> {
        try {
            const response = await api.get<CredeblResponse<VerifiableCredential[]>>(`/v1/orgs/${ORG_ID}/credentials`);
            return {
                success: response.data.statusCode === 200,
                data: response.data.data || [],
            };
        } catch (error) {
            // 404 means no credentials found - return empty array
            if ((error as { response?: { status: number } }).response?.status === 404) {
                return { success: true, data: [] };
            }
            throw error;
        }
    },

    // Get a specific credential by ID
    async getCredential(credentialId: string): Promise<ApiResponse<VerifiableCredential>> {
        const response = await api.get<CredeblResponse<VerifiableCredential>>(`/v1/orgs/${ORG_ID}/credentials/${credentialId}`);
        return {
            success: response.data.statusCode === 200,
            data: response.data.data,
        };
    },

    // Get credential offers (OID4VC credential offers)
    async getCredentialOffers(): Promise<ApiResponse<CredentialOffer[]>> {
        try {
            // Note: CREDEBL may not have a generic offers endpoint for holders
            // This would need to be adjusted based on actual API structure
            const response = await api.get<CredeblResponse<CredentialOffer[]>>(`/v1/orgs/${ORG_ID}/oid4vc/credential-offers`);
            return {
                success: response.data.statusCode === 200,
                data: response.data.data || [],
            };
        } catch (error) {
            // 404 or 400 means no offers - return empty array
            const status = (error as { response?: { status: number } }).response?.status;
            if (status === 404 || status === 400) {
                return { success: true, data: [] };
            }
            throw error;
        }
    },

    // Accept a credential offer
    async acceptCredentialOffer(offerId: string): Promise<ApiResponse<VerifiableCredential>> {
        const response = await api.post<CredeblResponse<VerifiableCredential>>(`/v1/orgs/${ORG_ID}/credentials/offers/${offerId}/accept`);
        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
            data: response.data.data,
        };
    },

    // Reject a credential offer
    async rejectCredentialOffer(offerId: string): Promise<ApiResponse<void>> {
        const response = await api.post<CredeblResponse<void>>(`/v1/orgs/${ORG_ID}/credentials/offers/${offerId}/reject`);
        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
        };
    },

    // Issue a credential (for issuers)
    async issueCredential(
        connectionId: string,
        credentialDefinitionId: string,
        attributes: Record<string, string>
    ): Promise<ApiResponse<CredentialOffer>> {
        const response = await api.post<CredeblResponse<CredentialOffer>>(`/v1/orgs/${ORG_ID}/credentials/offer`, {
            connectionId,
            credentialDefinitionId,
            attributes,
        });
        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
            data: response.data.data,
        };
    },
};

// Verification Services
export const verificationService = {
    // Get all verification requests / proof presentations
    async getVerificationRequests(): Promise<ApiResponse<VerificationRequest[]>> {
        try {
            const response = await api.get<CredeblResponse<VerificationRequest[]>>(`/v1/orgs/${ORG_ID}/proofs`);
            return {
                success: response.data.statusCode === 200,
                data: response.data.data || [],
            };
        } catch (error) {
            // 404 means no verifications - return empty array
            if ((error as { response?: { status: number } }).response?.status === 404) {
                return { success: true, data: [] };
            }
            throw error;
        }
    },

    // Get a specific verification request
    async getVerificationRequest(requestId: string): Promise<ApiResponse<VerificationRequest>> {
        const response = await api.get<CredeblResponse<VerificationRequest>>(`/v1/orgs/${ORG_ID}/proofs/${requestId}`);
        return {
            success: response.data.statusCode === 200,
            data: response.data.data,
        };
    },

    // Create a proof request
    async createProofRequest(proofRequest: Partial<ProofRequest>): Promise<ApiResponse<VerificationRequest>> {
        const response = await api.post<CredeblResponse<VerificationRequest>>(`/v1/orgs/${ORG_ID}/proofs/request`, proofRequest);
        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
            data: response.data.data,
        };
    },

    // Send proof presentation
    async sendProofPresentation(
        requestId: string,
        credentialIds: string[]
    ): Promise<ApiResponse<VerificationRequest>> {
        const response = await api.post<CredeblResponse<VerificationRequest>>(`/v1/orgs/${ORG_ID}/proofs/${requestId}/present`, {
            credentialIds,
        });
        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
            data: response.data.data,
        };
    },

    // Verify a proof
    async verifyProof(requestId: string): Promise<ApiResponse<{ verified: boolean; details: Record<string, unknown> }>> {
        const response = await api.post<CredeblResponse<{ verified: boolean; details: Record<string, unknown> }>>(`/v1/orgs/${ORG_ID}/proofs/${requestId}/verify`);
        return {
            success: response.data.statusCode === 200,
            data: response.data.data,
        };
    },
};

// Connection Services
export const connectionService = {
    // Get all connections
    async getConnections(): Promise<ApiResponse<Connection[]>> {
        try {
            const response = await api.get<CredeblResponse<Connection[]>>(`/v1/orgs/${ORG_ID}/connections`);
            return {
                success: response.data.statusCode === 200,
                data: response.data.data || [],
            };
        } catch (error) {
            // 404 or 403 means no connections - return empty array
            const status = (error as { response?: { status: number } }).response?.status;
            if (status === 404 || status === 403) {
                return { success: true, data: [] };
            }
            throw error;
        }
    },

    // Create connection invitation
    async createInvitation(): Promise<ApiResponse<{ invitationUrl: string; connection: Connection }>> {
        const response = await api.post<CredeblResponse<{ invitationUrl: string; connection: Connection }>>(`/v1/orgs/${ORG_ID}/connections/invitation`);
        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
            data: response.data.data,
        };
    },

    // Accept connection invitation
    async acceptInvitation(invitationUrl: string): Promise<ApiResponse<Connection>> {
        const response = await api.post<CredeblResponse<Connection>>(`/v1/orgs/${ORG_ID}/connections/accept`, { invitationUrl });
        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
            data: response.data.data,
        };
    },

    // Delete a connection
    async deleteConnection(connectionId: string): Promise<ApiResponse<void>> {
        const response = await api.delete<CredeblResponse<void>>(`/v1/orgs/${ORG_ID}/connections/${connectionId}`);
        return {
            success: response.data.statusCode === 200,
        };
    },
};

// Schema Services
export const schemaService = {
    // Get all schemas
    async getSchemas(): Promise<ApiResponse<Schema[]>> {
        try {
            const response = await api.get<CredeblResponse<Schema[]>>(`/v1/orgs/${ORG_ID}/schemas`);
            return {
                success: response.data.statusCode === 200,
                data: response.data.data || [],
            };
        } catch (error) {
            const status = (error as { response?: { status: number } }).response?.status;
            if (status === 404 || status === 403) {
                return { success: true, data: [] };
            }
            throw error;
        }
    },

    // Get credential definitions
    async getCredentialDefinitions(): Promise<ApiResponse<CredentialDefinition[]>> {
        try {
            const response = await api.get<CredeblResponse<CredentialDefinition[]>>(`/v1/orgs/${ORG_ID}/credential-definitions`);
            return {
                success: response.data.statusCode === 200,
                data: response.data.data || [],
            };
        } catch (error) {
            const status = (error as { response?: { status: number } }).response?.status;
            if (status === 404 || status === 403) {
                return { success: true, data: [] };
            }
            throw error;
        }
    },

    // Create a new schema
    async createSchema(
        name: string,
        version: string,
        attributes: string[]
    ): Promise<ApiResponse<Schema>> {
        const response = await api.post<CredeblResponse<Schema>>(`/v1/orgs/${ORG_ID}/schemas`, {
            name,
            version,
            attributes,
        });
        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
            data: response.data.data,
        };
    },

    // Create a credential definition
    async createCredentialDefinition(
        schemaId: string,
        tag: string
    ): Promise<ApiResponse<CredentialDefinition>> {
        const response = await api.post<CredeblResponse<CredentialDefinition>>(`/v1/orgs/${ORG_ID}/credential-definitions`, {
            schemaId,
            tag,
        });
        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
            data: response.data.data,
        };
    },
};

// Agent Service - Manages organization agents (dedicated and shared)
export const agentService = {
    // Get agent health status
    async getAgentHealth(orgId: string = ORG_ID): Promise<ApiResponse<{ isAlive: boolean }>> {
        try {
            const response = await api.get<CredeblResponse<{ isAlive: boolean }>>(
                `/v1/orgs/${orgId}/agents/health`
            );
            return {
                success: response.data.statusCode === 200,
                data: response.data.data,
            };
        } catch (error) {
            return { success: false, data: { isAlive: false }, error: 'Agent not reachable' };
        }
    },

    // Get organization agent configuration
    async getAgentConfig(orgId: string = ORG_ID): Promise<ApiResponse<OrgAgentConfig>> {
        try {
            const response = await api.get<CredeblResponse<{
                orgDid: string;
                agentEndPoint: string;
                tenantId?: string;
                orgAgentTypeId: string;
                ledgers?: { name: string; networkType: string };
            }>>(`/v1/orgs/${orgId}/agents`);

            const data = response.data.data;
            return {
                success: response.data.statusCode === 200,
                data: {
                    orgId,
                    orgDid: data.orgDid,
                    agentType: data.tenantId ? 'SHARED' : 'DEDICATED',
                    agentEndpoint: data.agentEndPoint,
                    tenantId: data.tenantId,
                    isActive: true,
                    ledger: data.ledgers?.name,
                    network: data.ledgers?.networkType,
                },
            };
        } catch (error) {
            return { success: false, error: 'Failed to get agent configuration' };
        }
    },

    // Create a tenant wallet (for shared agent mode)
    async createTenantWallet(
        orgId: string,
        label: string,
        ledgerId: string[],
        options?: { method?: string; keyType?: string; network?: string }
    ): Promise<ApiResponse<{ tenantId: string; did: string }>> {
        const response = await api.post<CredeblResponse<{
            tenantId: string;
            orgId: string;
            agentSpinUpStatus: number;
        }>>(`/v1/orgs/${orgId}/agents/wallet`, {
            label,
            ledgerId,
            method: options?.method || 'indy',
            keyType: options?.keyType || 'ed25519',
            network: options?.network,
        });

        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
            data: {
                tenantId: response.data.data?.tenantId || '',
                did: '', // DID is created separately
            },
        };
    },

    // Get issuer agent type
    getIssuerAgentType(): AgentType {
        return ISSUER_AGENT_TYPE;
    },

    // Get user wallet agent type  
    getUserAgentType(): AgentType {
        return USER_AGENT_TYPE;
    },
};

// Email Validation Service - OTP-based email verification and credential issuance
export const emailValidationService = {
    // Send OTP to user's email for verification
    async sendOTP(request: EmailOTPRequest): Promise<ApiResponse<{ sent: boolean; expiresIn: number }>> {
        try {
            // CREDEBL uses organization's notification service for OTP
            const response = await api.post<CredeblResponse<{ sent: boolean; expiresIn: number }>>(
                `/v1/orgs/${ORG_ID}/email/send-otp`,
                {
                    email: request.email,
                    purpose: 'email-verification',
                }
            );

            if (response.data.statusCode === 200 || response.data.statusCode === 201) {
                // Store OTP request timestamp
                localStorage.setItem('email_otp_sent', JSON.stringify({
                    email: request.email,
                    sentAt: new Date().toISOString(),
                    expiresIn: response.data.data?.expiresIn || 300, // 5 minutes default
                }));

                return {
                    success: true,
                    data: {
                        sent: true,
                        expiresIn: response.data.data?.expiresIn || 300,
                    },
                };
            }

            throw new Error(response.data.message || 'Failed to send OTP');
        } catch (error) {
            console.warn('CREDEBL OTP service not available, using mock OTP for demo...');

            // Demo mode: Generate a mock OTP (would be sent via email in production)
            const mockOtp = Math.floor(100000 + Math.random() * 900000).toString();
            console.log(`📧 Demo OTP for ${request.email}: ${mockOtp}`);

            // Store for demo verification
            localStorage.setItem('email_otp_pending', JSON.stringify({
                email: request.email,
                otp: mockOtp, // Only for demo - never store real OTPs client-side!
                sentAt: new Date().toISOString(),
                expiresIn: 300,
            }));

            return {
                success: true,
                data: { sent: true, expiresIn: 300 },
                message: `Demo mode: OTP is ${mockOtp}`,
            };
        }
    },

    // Verify OTP and issue email registration credential
    async verifyOTPAndIssueCredential(
        verification: EmailOTPVerification,
        userDid: string
    ): Promise<ApiResponse<EmailValidation>> {
        try {
            // First verify the OTP
            const otpValid = await this.verifyOTP(verification);

            if (!otpValid.success) {
                return {
                    success: false,
                    error: otpValid.error || 'Invalid OTP',
                    data: {
                        email: verification.email,
                        status: 'failed',
                    },
                };
            }

            // OTP verified - now issue the credential via dedicated issuer agent
            console.log(`Email ${verification.email} verified. Issuing credential via ${ISSUER_AGENT_TYPE} agent...`);

            const credentialResult = await this.issueEmailCredential(verification.email, userDid);

            if (credentialResult.success) {
                const validation: EmailValidation = {
                    email: verification.email,
                    status: 'verified',
                    verifiedAt: new Date().toISOString(),
                    credentialId: credentialResult.data?.credentialId,
                };

                // Clear OTP data
                localStorage.removeItem('email_otp_pending');
                localStorage.removeItem('email_otp_sent');

                return {
                    success: true,
                    data: validation,
                };
            }

            return {
                success: false,
                error: 'Failed to issue credential after verification',
                data: {
                    email: verification.email,
                    status: 'failed',
                },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Verification failed',
                data: {
                    email: verification.email,
                    status: 'failed',
                },
            };
        }
    },

    // Verify OTP only (without credential issuance)
    async verifyOTP(verification: EmailOTPVerification): Promise<ApiResponse<{ verified: boolean }>> {
        try {
            // Try CREDEBL's OTP verification endpoint
            const response = await api.post<CredeblResponse<{ verified: boolean }>>(
                `/v1/orgs/${ORG_ID}/email/verify-otp`,
                {
                    email: verification.email,
                    otp: verification.otp,
                }
            );

            return {
                success: response.data.statusCode === 200 && response.data.data?.verified,
                data: { verified: response.data.data?.verified || false },
            };
        } catch {
            // Demo mode: Check against stored mock OTP
            const storedOtp = localStorage.getItem('email_otp_pending');
            if (storedOtp) {
                const { email, otp, sentAt, expiresIn } = JSON.parse(storedOtp);

                // Check expiry
                const sentTime = new Date(sentAt).getTime();
                const now = Date.now();
                if (now - sentTime > expiresIn * 1000) {
                    return {
                        success: false,
                        error: 'OTP has expired',
                        data: { verified: false },
                    };
                }

                // Check OTP match
                if (email === verification.email && otp === verification.otp) {
                    return {
                        success: true,
                        data: { verified: true },
                    };
                }
            }

            return {
                success: false,
                error: 'Invalid OTP',
                data: { verified: false },
            };
        }
    },

    // Issue email registration credential via the dedicated issuer agent
    async issueEmailCredential(
        email: string,
        holderDid: string
    ): Promise<ApiResponse<{ credentialId: string; credential?: EmailRegistrationCredential }>> {
        const issuerOrgId = ISSUER_AGENT_ORG_ID;

        try {
            // Use the appropriate issuance endpoint based on agent type
            if (ISSUER_AGENT_TYPE === 'DEDICATED') {
                // Direct issuance via dedicated agent
                const response = await api.post<CredeblResponse<{
                    id: string;
                    state: string;
                    credentialRecordId: string;
                }>>(`/v1/orgs/${issuerOrgId}/credentials/offer`, {
                    credentialDefinitionId: EMAIL_CRED_DEF_ID,
                    attributes: [
                        { name: 'email', value: email },
                        { name: 'registrationDate', value: new Date().toISOString() },
                        { name: 'serviceName', value: 'Pocket Labs Identity Service' },
                        { name: 'serviceProvider', value: 'Pocket Labs' },
                        { name: 'holderDid', value: holderDid },
                        { name: 'verifiedAt', value: new Date().toISOString() },
                    ],
                    comment: 'Email Registration Credential - Email verified via OTP',
                    // Connectionless issuance for holder
                    connectionId: undefined, // Will use OOB
                });

                if (response.data.statusCode === 200 || response.data.statusCode === 201) {
                    return {
                        success: true,
                        data: {
                            credentialId: response.data.data?.credentialRecordId || response.data.data?.id || '',
                        },
                    };
                }
            } else {
                // Shared agent - use tenant-scoped issuance
                const tenantId = localStorage.getItem('issuer_tenant_id') || '';
                const response = await api.post<CredeblResponse<{
                    id: string;
                    state: string;
                }>>(`/v1/orgs/${issuerOrgId}/agents/credentials/offer`, {
                    tenantId,
                    credentialDefinitionId: EMAIL_CRED_DEF_ID,
                    attributes: [
                        { name: 'email', value: email },
                        { name: 'registrationDate', value: new Date().toISOString() },
                        { name: 'serviceName', value: 'Pocket Labs Identity Service' },
                        { name: 'serviceProvider', value: 'Pocket Labs' },
                        { name: 'holderDid', value: holderDid },
                        { name: 'verifiedAt', value: new Date().toISOString() },
                    ],
                });

                if (response.data.statusCode === 200 || response.data.statusCode === 201) {
                    return {
                        success: true,
                        data: {
                            credentialId: response.data.data?.id || '',
                        },
                    };
                }
            }

            throw new Error('Credential issuance failed');
        } catch (error) {
            console.warn('CREDEBL credential issuance failed, creating local credential...');

            // Fallback: Create local credential for demo
            const localCredential = emailRegistrationService.createLocalEmailCredential(email, holderDid);

            // Add verification timestamp
            (localCredential.credentialSubject as Record<string, string>).verifiedAt = new Date().toISOString();

            emailRegistrationService.storeLocalCredential(localCredential);

            return {
                success: true,
                data: {
                    credentialId: localCredential.id,
                    credential: localCredential,
                },
                message: 'Credential stored locally (demo mode)',
            };
        }
    },

    // Get current email validation status
    getValidationStatus(): EmailValidation | null {
        const stored = localStorage.getItem('email_validation_status');
        return stored ? JSON.parse(stored) : null;
    },

    // Save email validation status
    saveValidationStatus(validation: EmailValidation): void {
        localStorage.setItem('email_validation_status', JSON.stringify(validation));
    },
};

export default {
    auth: authService,
    credentials: credentialService,
    verification: verificationService,
    connections: connectionService,
    schemas: schemaService,
    agents: agentService,
    emailValidation: emailValidationService,
};
