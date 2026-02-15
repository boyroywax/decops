import api from '../../api/client';
import type { ApiResponse, Schema, CredentialDefinition } from '../../types';
import { CredeblResponse } from './types';

const ORG_ID = import.meta.env.VITE_CREDEBL_ORG_ID || '';

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
