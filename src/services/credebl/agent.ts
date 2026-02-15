import api from '../../api/client';
import type { ApiResponse, AgentType, OrgAgentConfig } from '../../types';
import { CredeblResponse } from './types';

const ORG_ID = import.meta.env.VITE_CREDEBL_ORG_ID || '';
const ISSUER_AGENT_TYPE: AgentType = (import.meta.env.VITE_ISSUER_AGENT_TYPE as AgentType) || 'DEDICATED';
const USER_AGENT_TYPE: AgentType = (import.meta.env.VITE_USER_AGENT_TYPE as AgentType) || 'SHARED';

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
