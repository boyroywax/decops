import api from '../../api/client';
import { encryptPassword } from '../../utils/crypto';
import type { ApiResponse, User, DIDDocument } from '../../types';
import { CredeblResponse, LoginResponse, SignupRequest, UserProfile, DIDCreationResponse } from './types';
import { generateAndPersistLocalDIDKey, getOrCreateLocalDIDKey } from './did';

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
        const response = await api.post<CredeblResponse<{ message: string }>>('/v1/auth/send-verification-email', {
            email
        });

        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
            data: { sent: true }
        };
    },

    // Step 2 of signup: Complete registration after email verification
    async signup(signupData: SignupRequest): Promise<ApiResponse<{ userId: string }>> {
        const encryptedPassword = encryptPassword(signupData.password);

        const response = await api.post<CredeblResponse<{ id: string }>>('/v1/auth/signup', {
            ...signupData,
            password: encryptedPassword
        });

        return {
            success: response.data.statusCode === 200 || response.data.statusCode === 201,
            data: { userId: response.data.data.id }
        };
    },

    // Check if user already exists
    async checkUserExists(email: string): Promise<ApiResponse<{ exists: boolean; isEmailVerified: boolean }>> {
        try {
            // Note: This endpoint might vary based on CREDEBL version
            // Using a common pattern for checking user existence
            const response = await api.get<CredeblResponse<{ exists: boolean; isEmailVerified: boolean }>>(`/v1/users/exists`, {
                params: { email }
            });

            return {
                success: response.data.statusCode === 200,
                data: response.data.data
            };
        } catch (error) {
            // If 404, user doesn't exist
            if ((error as { response?: { status: number } }).response?.status === 404) {
                return { success: true, data: { exists: false, isEmailVerified: false } };
            }
            throw error;
        }
    },

    // Forgot password - sends reset link to email
    async forgotPassword(email: string): Promise<ApiResponse<{ sent: boolean }>> {
        const response = await api.post<CredeblResponse<void>>('/v1/auth/forgot-password', {
            email
        });

        return {
            success: response.data.statusCode === 200,
            data: { sent: true }
        };
    },

    // Reset password with token (from email link)
    async resetPasswordWithToken(
        email: string,
        token: string,
        newPassword: string
    ): Promise<ApiResponse<{ reset: boolean }>> {
        const encryptedPassword = encryptPassword(newPassword);

        const response = await api.post<CredeblResponse<void>>('/v1/auth/reset-password', {
            email,
            token,
            password: encryptedPassword
        });

        return {
            success: response.data.statusCode === 200,
            data: { reset: true }
        };
    },

    // Reset password with current password
    async resetPassword(
        email: string,
        oldPassword: string,
        newPassword: string
    ): Promise<ApiResponse<{ reset: boolean }>> {
        const encryptedOldPassword = encryptPassword(oldPassword);
        const encryptedNewPassword = encryptPassword(newPassword);

        const response = await api.post<CredeblResponse<void>>('/v1/users/password', {
            email,
            oldPassword: encryptedOldPassword,
            newPassword: encryptedNewPassword
        });

        return {
            success: response.data.statusCode === 200,
            data: { reset: true }
        };
    },

    // Login with DID (placeholder - needs DID wallet integration)
    async loginWithDID(did: string, signature: string): Promise<ApiResponse<{ user: User; token: string }>> {
        // Implementation depends on CREDEBL DID auth flow
        // This is a placeholder
        return {
            success: false,
            error: "Not implemented yet"
        };
    },

    // Register/Create new DID for the user
    // CREDEBL supports multiple DID methods: did:indy, did:polygon, did:key, did:web
    // The DID is created via the organization's agent on the configured ledger
    async registerDID(method: string = 'indy'): Promise<ApiResponse<DIDCreationResponse>> {
        const orgId = import.meta.env.VITE_CREDEBL_ORG_ID || '';

        const response = await api.post<CredeblResponse<DIDCreationResponse>>(`/v1/orgs/${orgId}/dids/register`, {
            method,
            // Additional options based on method
        });

        if (response.data.statusCode === 200 || response.data.statusCode === 201) {
            // Store DID
            localStorage.setItem('user_did', response.data.data.did);
            localStorage.setItem('user_did_document', JSON.stringify(response.data.data.didDocument));

            return {
                success: true,
                data: response.data.data
            };
        }

        return {
            success: false,
            error: response.data.message
        };
    },

    // New method for creating a local encrypted identity
    async registerLocalIdentity(password: string): Promise<ApiResponse<DIDCreationResponse>> {
        try {
            const result = await generateAndPersistLocalDIDKey(password);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create local identity'
            };
        }
    },

    // New method to unlock existing identity
    async unlockLocalIdentity(password: string): Promise<ApiResponse<DIDCreationResponse>> {
        try {
            const result = await getOrCreateLocalDIDKey(password);
            if (result) {
                return {
                    success: true,
                    data: result
                };
            }
            return {
                success: false,
                error: 'No local identity found'
            };
        } catch (error) {
            return {
                success: false,
                error: 'Invalid password or corrupted key' // Most likely cause
            };
        }
    },

    // Check if an encrypted identity exists
    hasLocalIdentity(): boolean {
        return !!localStorage.getItem('user_encrypted_keypair') || !!localStorage.getItem('user_keypair');
    },

    // Verify DID ownership
    async verifyDID(did: string): Promise<ApiResponse<{ verified: boolean; didDocument: DIDDocument }>> {
        const orgId = import.meta.env.VITE_CREDEBL_ORG_ID || '';

        const response = await api.get<CredeblResponse<{ verified: boolean; didDocument: DIDDocument }>>(`/v1/orgs/${orgId}/dids/${did}/verify`);

        return {
            success: response.data.statusCode === 200,
            data: response.data.data
        };
    },

    // Get current user profile
    async getProfile(): Promise<CredeblResponse<UserProfile>> {
        const response = await api.get<CredeblResponse<UserProfile>>('/v1/users/profile');
        return response.data;
    },

    // Logout
    async logout(): Promise<void> {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('session_id');
        // Keep DID info for convenience if needed, or clear it too
        // localStorage.removeItem('user_did');
    }
};
