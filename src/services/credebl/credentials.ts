import api from '../../api/client';
import type { ApiResponse, VerifiableCredential, CredentialOffer } from '../../types';
import { CredeblResponse } from './types';

const ORG_ID = import.meta.env.VITE_CREDEBL_ORG_ID || '';

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
