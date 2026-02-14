import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { keycloakClient } from '../api/client';

interface UserProfile {
    id?: string;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    [key: string]: any;
}

interface AuthContextType {
    isAuthenticated: boolean;
    user: UserProfile | null;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
    isInitialized: boolean;
    error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Check for existing token in localStorage
        const storedToken = localStorage.getItem('auth_token');
        if (storedToken) {
            setToken(storedToken);
            setIsAuthenticated(true);
            // Ideally we should decode the token to get user info or call userinfo endpoint
            // For now, we'll just restore session. A real app would verify expiry.
            setUser({ username: 'Restored User' });
        }
        setIsInitialized(true);
    }, []);

    const login = async (username: string, password: string) => {
        setError(null);
        try {
            const params = new URLSearchParams();
            params.append('client_id', import.meta.env.VITE_KEYCLOAK_CLIENT_ID);
            params.append('grant_type', 'password');
            params.append('username', username);
            params.append('password', password);
            params.append('scope', 'openid');

            const response = await keycloakClient.post(
                `/realms/${import.meta.env.VITE_KEYCLOAK_REALM}/protocol/openid-connect/token`,
                params
            );

            const { access_token, id_token } = response.data;

            if (access_token) {
                localStorage.setItem('auth_token', access_token);
                setToken(access_token);
                setIsAuthenticated(true);

                // Try to get user info if possible, or just decode
                // For this step, we just set a basic user profile
                setUser({ username: username });
            }
        } catch (err: any) {
            console.error("Login failed", err);
            setError(err.response?.data?.error_description || "Login failed. Please check credentials.");
            throw err;
        }
    };

    const logout = () => {
        localStorage.removeItem('auth_token');
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, token, login, logout, isInitialized, error }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
