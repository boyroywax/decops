import api from '../../api/client';
import type { ApiResponse, Connection } from '../../types';
import { CredeblResponse } from './types';

const ORG_ID = import.meta.env.VITE_CREDEBL_ORG_ID || '';

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
