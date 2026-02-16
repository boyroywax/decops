import axios from 'axios';

const apiClient = axios.create({
    baseURL: (import.meta.env.VITE_CREDEBL_API_URL as string) || '',
    headers: {
        'Content-Type': 'application/json',
    },
});



export default apiClient;
