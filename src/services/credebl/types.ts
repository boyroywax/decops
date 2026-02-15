import type {
    DIDDocument,
    AgentType,
} from '../../types';

// CREDEBL API Response wrapper
export interface CredeblResponse<T> {
    statusCode: number;
    message: string;
    data: T;
}

// Login response type
export interface LoginResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    sessionId: string;
}

// Signup request type
export interface SignupRequest {
    email: string;
    firstName?: string;
    lastName?: string;
    password: string;
    isPasskey?: boolean;
}

// User profile response type
export interface UserProfile {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isEmailVerified: boolean;
}

// DID creation response
export interface DIDCreationResponse {
    did: string;
    didDocument: DIDDocument;
    verkey?: string;
}

// OOB Credential Offer response
export interface OOBCredentialOfferResponse {
    invitationUrl: string;
    credentialOfferUri?: string;
    state: string;
}
