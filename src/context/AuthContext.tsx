import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type { User, AuthState, EmailValidation } from '../types';
import { authService, emailRegistrationService, emailValidationService } from '../services/credebl';

// Action types
type AuthAction =
    | { type: 'AUTH_START' }
    | { type: 'AUTH_SUCCESS'; payload: User }
    | { type: 'AUTH_ERROR'; payload: string }
    | { type: 'LOGOUT' }
    | { type: 'CLEAR_ERROR' }
    | { type: 'DID_CREATED'; payload: string }
    | { type: 'CREDENTIAL_ISSUED' }
    | { type: 'EMAIL_VALIDATION_UPDATED'; payload: EmailValidation };

// Initial state
const initialState: AuthState = {
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
};

// Reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
    console.log('[Auth] Reducer action:', action.type);
    switch (action.type) {
        case 'AUTH_START':
            return { ...state, isLoading: true, error: null };
        case 'AUTH_SUCCESS':
            return {
                ...state,
                user: action.payload,
                isAuthenticated: true,
                isLoading: false,
                error: null,
            };
        case 'AUTH_ERROR':
            return {
                ...state,
                user: null,
                isAuthenticated: false,
                isLoading: false,
                error: action.payload,
            };
        case 'LOGOUT':
            return {
                ...state,
                user: null,
                isAuthenticated: false,
                isLoading: false,
                error: null,
            };
        case 'CLEAR_ERROR':
            return { ...state, error: null };
        case 'DID_CREATED':
            return state.user
                ? { ...state, user: { ...state.user, did: action.payload } }
                : state;
        case 'CREDENTIAL_ISSUED':
            return state.user
                ? { ...state, user: { ...state.user, hasEmailRegistrationCredential: true } }
                : state;
        case 'EMAIL_VALIDATION_UPDATED':
            return state.user
                ? { ...state, user: { ...state.user, emailValidation: action.payload, hasEmailRegistrationCredential: action.payload.status === 'verified' } }
                : state;
        default:
            return state;
    }
}

// Context type
interface AuthContextType extends AuthState {
    login: (email: string, password: string) => Promise<void>;
    loginWithDID: (did: string, signature: string) => Promise<void>;
    loginWithLocalDID: (password: string) => Promise<void>;
    registerDID: () => Promise<{ did: string } | null>;
    issueEmailCredential: () => Promise<boolean>;
    updateEmailValidation: (validation: EmailValidation) => void;
    logout: () => Promise<void>;
    isInitialized: boolean;
    clearError: () => void;
    token: string | null;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [state, dispatch] = useReducer(authReducer, initialState);
    console.log('[Auth] Render state:', { isLoading: state.isLoading, isAuthenticated: state.isAuthenticated });

    // Check for existing auth on mount
    useEffect(() => {
        const checkAuth = async () => {
            const storedUserStr = localStorage.getItem('user');
            const storedDid = localStorage.getItem('user_did');

            if (storedUserStr && storedDid) {
                try {
                    const storedUser: User = JSON.parse(storedUserStr);
                    dispatch({ type: 'AUTH_SUCCESS', payload: storedUser });
                } catch (e) {
                    console.error('[Auth] Error parsing user:', e);
                    localStorage.removeItem('user');
                    localStorage.removeItem('user_did');
                    dispatch({ type: 'AUTH_ERROR', payload: '' });
                }
            } else {
                dispatch({ type: 'AUTH_ERROR', payload: '' });
            }
        };

        checkAuth();
    }, []);

    // Login with authentic Credebl API
    const login = async (email: string, password: string) => {
        dispatch({ type: 'AUTH_START' });

        try {
            // New login signature returns CredeblResponse<LoginResponse>
            const response = await authService.login(email, password);

            if (response.statusCode === 200 && response.data) {
                // Tokens are already stored by authService, but we double check
                localStorage.setItem('access_token', response.data.access_token);

                // Fetch user profile
                const profileResponse = await authService.getProfile();

                if (profileResponse.statusCode === 200 && profileResponse.data) {
                    let userDid = localStorage.getItem('user_did') || '';

                    if (!userDid) {
                        try {
                            const didResponse = await authService.registerDID('key');
                            if (didResponse.success && didResponse.data?.did) {
                                userDid = didResponse.data.did;
                            }
                        } catch (didError) {
                            console.warn('Failed to create DID via API, using local generation flow');
                        }
                    }

                    const hasCredential = await emailRegistrationService.hasEmailRegistrationCredential(
                        profileResponse.data.email
                    );

                    const existingValidation = emailValidationService.getValidationStatus();
                    const emailValidation = existingValidation?.email === profileResponse.data.email
                        ? existingValidation
                        : undefined;

                    const user: User = {
                        id: profileResponse.data.id,
                        email: profileResponse.data.email,
                        did: userDid,
                        createdAt: new Date().toISOString(),
                        profile: {
                            name: `${profileResponse.data.firstName} ${profileResponse.data.lastName}`.trim() || profileResponse.data.email,
                        },
                        hasEmailRegistrationCredential: hasCredential,
                        emailValidation: emailValidation || undefined,
                    };

                    localStorage.setItem('user', JSON.stringify(user));
                    dispatch({ type: 'AUTH_SUCCESS', payload: user });

                } else {
                    dispatch({ type: 'AUTH_ERROR', payload: 'Failed to fetch user profile' });
                }
            } else {
                dispatch({ type: 'AUTH_ERROR', payload: response.message || 'Login failed' });
            }
        } catch (error) {
            console.error("Context Login Error:", error);
            const message = error instanceof Error ? error.message : 'Login failed';
            dispatch({ type: 'AUTH_ERROR', payload: message });
            throw error;
        }
    };

    const loginWithDID = async (did: string, _signature: string) => {
        dispatch({ type: 'AUTH_START' });
        try {
            const response = await authService.loginWithDID(did, _signature);
            if (response.success && response.data) {
                localStorage.setItem('user', JSON.stringify(response.data.user));
                localStorage.setItem('user_did', response.data.user.did);
                dispatch({ type: 'AUTH_SUCCESS', payload: response.data.user });
            } else {
                dispatch({ type: 'AUTH_ERROR', payload: response.error || 'Login failed' });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Login failed';
            dispatch({ type: 'AUTH_ERROR', payload: message });
        }
    };

    // Login with locally generated did:key (no server required)
    const loginWithLocalDID = async (password: string) => {
        dispatch({ type: 'AUTH_START' });
        try {
            let userResult;

            // Check if we have an existing identity to unlock
            if (authService.hasLocalIdentity()) {
                const unlockResult = await authService.unlockLocalIdentity(password);
                if (!unlockResult.success) {
                    throw new Error(unlockResult.error || 'Failed to unlock identity');
                }
                userResult = unlockResult;
            } else {
                // Create new identity
                const createResult = await authService.registerLocalIdentity(password);
                if (!createResult.success) {
                    throw new Error(createResult.error || 'Failed to create identity');
                }
                userResult = createResult;
            }

            if (!userResult.data) {
                throw new Error('No identity data returned');
            }

            const did = userResult.data.did;
            const shortDid = did.substring(did.lastIndexOf(':') + 1, did.lastIndexOf(':') + 9);

            const user: User = {
                id: did,
                email: '',
                did: did,
                createdAt: new Date().toISOString(),
                profile: {
                    name: `Agent ${shortDid}`,
                },
                hasEmailRegistrationCredential: false,
            };

            localStorage.setItem('user_did', did);
            localStorage.setItem('user', JSON.stringify(user));
            dispatch({ type: 'AUTH_SUCCESS', payload: user });
        } catch (error) {
            console.error('DID login error:', error);
            const message = error instanceof Error ? error.message : 'DID generation/unlock failed';
            dispatch({ type: 'AUTH_ERROR', payload: message });
        }
    };

    const registerDID = async (): Promise<{ did: string } | null> => {
        try {
            const response = await authService.registerDID();
            if (response.success && response.data) {
                const did = response.data.did;
                localStorage.setItem('user_did', did);
                dispatch({ type: 'DID_CREATED', payload: did });
                return { did };
            } else {
                dispatch({ type: 'AUTH_ERROR', payload: response.error || 'DID creation failed' });
                return null;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'DID creation failed';
            dispatch({ type: 'AUTH_ERROR', payload: message });
            return null;
        }
    };

    const issueEmailCredential = async (): Promise<boolean> => {
        if (!state.user?.email || !state.user?.did) {
            return false;
        }
        try {
            const result = await emailRegistrationService.issueEmailRegistrationCredential(
                state.user.email,
                state.user.did
            );
            if (result.success) {
                dispatch({ type: 'CREDENTIAL_ISSUED' });
                const user = { ...state.user, hasEmailRegistrationCredential: true };
                localStorage.setItem('user', JSON.stringify(user));
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    };

    const updateEmailValidation = (validation: EmailValidation) => {
        dispatch({ type: 'EMAIL_VALIDATION_UPDATED', payload: validation });
        if (state.user) {
            const user = {
                ...state.user,
                emailValidation: validation,
                hasEmailRegistrationCredential: validation.status === 'verified',
            };
            localStorage.setItem('user', JSON.stringify(user));
        }
    };

    const logout = async () => {
        try {
            await authService.logout();
        } catch {
            // Ignore
        } finally {
            localStorage.removeItem('user_did');
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            dispatch({ type: 'LOGOUT' });
        }
    };

    const clearError = () => {
        dispatch({ type: 'CLEAR_ERROR' });
    };

    const value: AuthContextType = {
        ...state,
        login,
        loginWithDID,
        loginWithLocalDID,
        registerDID,
        issueEmailCredential,
        updateEmailValidation,
        logout,
        clearError,
        isInitialized: !state.isLoading,
        token: null
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
