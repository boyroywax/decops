import api from '../../api/client';
import type { ApiResponse, VerificationRequest, ProofRequest } from '../../types';
import { CredeblResponse } from './types';

const ORG_ID = import.meta.env.VITE_CREDEBL_ORG_ID || '';

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
