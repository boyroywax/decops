import api from '../../api/client';
import type { ApiResponse, EmailRegistrationCredential, AgentType } from '../../types';
import { CredeblResponse, OOBCredentialOfferResponse as OOBResponse } from './types';

const ORG_ID = import.meta.env.VITE_CREDEBL_ORG_ID || '';
const ORG_DID = import.meta.env.VITE_CREDEBL_ORG_DID || '';
const EMAIL_CRED_DEF_ID = import.meta.env.VITE_EMAIL_CREDENTIAL_DEF_ID || '';

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
            const response = await api.post<CredeblResponse<OOBResponse>>(
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
        return false;
    },
};
