import api from '../../api/client';
import type { ApiResponse, EmailOTPRequest, EmailOTPVerification, EmailValidation, AgentType, EmailRegistrationCredential } from '../../types';
import { CredeblResponse } from './types';
import { emailRegistrationService } from './emailRegistration';

const ORG_ID = import.meta.env.VITE_CREDEBL_ORG_ID || '';
const ISSUER_AGENT_TYPE: AgentType = (import.meta.env.VITE_ISSUER_AGENT_TYPE as AgentType) || 'DEDICATED';
const ISSUER_AGENT_ORG_ID = import.meta.env.VITE_ISSUER_AGENT_ORG_ID || ORG_ID;
const EMAIL_CRED_DEF_ID = import.meta.env.VITE_EMAIL_CREDENTIAL_DEF_ID || '';

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
