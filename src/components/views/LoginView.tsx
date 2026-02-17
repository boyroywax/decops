import { useState } from 'react';
import { Key, CheckCircle, Rocket, Globe, Lightbulb } from 'lucide-react';
import { GradientIcon } from "../shared/GradientIcon";
import { useAuth } from '../../context/AuthContext';
import '../../styles/components/login.css';

export function LoginView() {
    const [stage, setStage] = useState<'idle' | 'generating' | 'complete'>('idle');
    const [password, setPassword] = useState('');
    const { loginWithLocalDID, isLoading, error } = useAuth();

    const handleDIDLogin = async () => {
        if (!password) {
            return;
        }
        try {
            setStage('generating');
            await loginWithLocalDID(password);
            setStage('complete');
            // AuthContext state change will trigger redirect in App.tsx
        } catch (err) {
            console.error('DID login failed:', err);
            setStage('idle');
        }
    };

    return (
        <div className="login">
            <div className="login__card">
                <h1 className="login__title">
                    <GradientIcon icon={Key} size={28} gradient={["#00e5a0", "#38bdf8"]} /> Decops Identity
                </h1>
                <p className="login__subtitle">
                    Create or unlock your Decentralized Identity
                </p>

                <div className="login__field">
                    <label className="login__label">
                        Identity Password
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password to encrypt/unlock your keys"
                        className="login__input"
                    />
                    <p className="login__hint">
                        This password encrypts your private keys on this device.
                    </p>
                </div>

                {error && (
                    <div className="login__error">
                        {error}
                    </div>
                )}

                {stage === 'generating' && (
                    <div className="login__status">
                        <div className="login__spinner"></div>
                        <p className="login__status-text">
                            🆔 Generating your did:key identity...
                        </p>
                    </div>
                )}

                {stage === 'complete' && (
                    <div className="login__status">
                        <p className="login__status-text">
                            <CheckCircle size={14} style={{ marginRight: 6, verticalAlign: "text-bottom" }} /> Identity ready! Redirecting...
                        </p>
                    </div>
                )}

                <button
                    onClick={handleDIDLogin}
                    disabled={isLoading || stage !== 'idle' || !password}
                    className="login__submit"
                >
                    {stage === 'generating' ? 'Generating...' : <><Rocket size={16} /> Enter with DID:Key</>}
                </button>

                <div className="login__info">
                    <h4 className="login__info-title"><Globe size={14} /> How it works:</h4>
                    <ol className="login__info-steps">
                        <li><strong>Generate Key</strong> — An Ed25519 keypair is created in your browser</li>
                        <li><strong>Create DID</strong> — A <code>did:key</code> identifier is derived from your public key</li>
                        <li><strong>Store Locally</strong> — Your keys are saved in localStorage for this device</li>
                    </ol>
                    <p className="login__info-note">
                        <Lightbulb size={12} style={{ marginRight: 6, verticalAlign: "middle" }} /> No server required. Your identity is fully self-sovereign and stored only on this device.
                        Returning users are automatically authenticated.
                    </p>
                </div>
            </div>
        </div>
    );
}
