/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_CREDEBL_API_URL: string
    readonly VITE_CREDEBL_ORG_ID: string
    readonly VITE_CREDEBL_API_KEY: string
    readonly VITE_CRYPTO_KEY: string
    readonly VITE_KEYCLOAK_URL: string
    readonly VITE_KEYCLOAK_REALM: string
    readonly VITE_KEYCLOAK_CLIENT_ID: string
    readonly VITE_KEYCLOAK_CLIENT_SECRET?: string
    readonly VITE_CREDEBL_ORG_DID: string
    readonly VITE_EMAIL_CREDENTIAL_DEF_ID: string
    readonly VITE_ISSUER_AGENT_TYPE: string
    readonly VITE_ISSUER_AGENT_ORG_ID: string
    readonly VITE_USER_AGENT_TYPE: string
    readonly VITE_DID_METHOD: string
    readonly VITE_DID_NETWORK: string
    readonly VITE_CREDEBL_ISSUER_ID: string
    readonly VITE_EMAIL_TEMPLATE_ID: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
