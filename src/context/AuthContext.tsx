import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import keycloak from '../auth/keycloak';

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
    login: () => void;
    logout: () => void;
    isInitialized: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        const initKeycloak = async () => {
            try {
                const authenticated = await keycloak.init({
                    onLoad: 'login-required',
                    checkLoginIframe: false,
                });

                setIsAuthenticated(authenticated);
                if (authenticated) {
                    setToken(keycloak.token || null);
                    const profile = await keycloak.loadUserProfile();
                    setUser(profile);
                }
            } catch (error) {
                console.error("Failed to initialize Keycloak", error);
            } finally {
                setIsInitialized(true);
            }
        };

        initKeycloak();

        keycloak.onTokenExpired = () => {
            keycloak.updateToken(30).catch(() => {
                console.error('Failed to refresh token');
                logout();
            });
        };

    }, []);

    const login = () => keycloak.login();
    const logout = () => keycloak.logout();

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, token, login, logout, isInitialized }}>
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
