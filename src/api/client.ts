import axios from 'axios';

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_CREDEBL_API_URL || '',
    headers: {
        'Content-Type': 'application/json',
    },
});

export const keycloakClient = axios.create({
    baseURL: import.meta.env.VITE_KEYCLOAK_URL || '',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
    },
});

export default apiClient;
