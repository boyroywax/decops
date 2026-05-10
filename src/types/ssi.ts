/**
 * SSI / Credebl types — DID documents, verifiable credentials,
 * proof requests, connections, schemas, and credential definitions.
 * Extracted from types/index.ts for modularity.
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface DIDDocument {
  id: string;
  controller: string;
  verificationMethod: any[];
  authentication: string[];
  assertionMethod: string[];
}

export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: { id: string; name?: string } | string;
  issuanceDate: string;
  credentialSubject: Record<string, any>;
  proof?: any;
}

export interface CredentialOffer {
  credentialRecordId?: string;
  credentialDefinitionId: string;
  attributes: { name: string; value: string }[];
}

export interface VerificationRequest {
  proofRecordId?: string;
  state: string;
  presentationRequest?: any;
}

export interface ProofRequest {
  name: string;
  version: string;
  attributes: Record<string, any>;
}

export interface Connection {
  connectionId: string;
  state: string;
  theirDid: string;
  theirLabel: string;
}

export interface Schema {
  schemaId: string;
  name: string;
  version: string;
  attributes: string[];
}

export interface CredentialDefinition {
  credentialDefinitionId: string;
  tag: string;
  schemaId: string;
}

export interface EmailRegistrationCredential extends VerifiableCredential {
  credentialSubject: {
    id: string;
    email: string;
    registrationDate: string;
    serviceName: string;
    serviceProvider: string;
    verifiedAt?: string;
  };
}

export type AgentType = 'DEDICATED' | 'SHARED';

export interface OrgAgentConfig {
  orgId: string;
  orgDid: string;
  agentType: AgentType;
  agentEndpoint: string;
  tenantId?: string;
  isActive: boolean;
  ledger?: string;
  network?: string;
}

export interface EmailOTPRequest {
  email: string;
}

export interface EmailOTPVerification {
  email: string;
  otp: string;
}
