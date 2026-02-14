import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export function LoginView() {
    const [stage, setStage] = useState<'idle' | 'generating' | 'complete'>('idle');
    const { loginWithLocalDID, isLoading, error } = useAuth();

    const handleDIDLogin = async () => {
        try {
            setStage('generating');
            await loginWithLocalDID();
            setStage('complete');
            // AuthContext state change will trigger redirect in App.tsx
        } catch (err) {
            console.error('DID login failed:', err);
            setStage('idle');
        }
    };

    return (
        <div style={{
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0f",
            color: "#e4e4e7",
            fontFamily: "'Space Grotesk', sans-serif",
            margin: 0,
            padding: 0,
        }}>
            <div style={{
                background: "rgba(255,255,255,0.02)",
                padding: 40,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                width: 420,
                boxShadow: "0 4px 24px rgba(0,0,0,0.4)"
            }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 28 }}>🔑</span> Decops Identity
                </h1>
                <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 32 }}>
                    Create or restore your Decentralized Identity
                </p>

                {error && (
                    <div style={{
                        color: "#ef4444",
                        fontSize: 12,
                        background: "rgba(239,68,68,0.1)",
                        padding: 12,
                        borderRadius: 6,
                        marginBottom: 16
                    }}>
                        {error}
                    </div>
                )}

                {stage === 'generating' && (
                    <div style={{
                        marginBottom: 24,
                        padding: 16,
                        background: "rgba(0,229,160,0.05)",
                        borderRadius: 8,
                        border: "1px solid rgba(0,229,160,0.1)"
                    }}>
                        <div style={{
                            width: 20,
                            height: 20,
                            border: "2px solid #00e5a0",
                            borderRadius: "50%",
                            borderTopColor: "transparent",
                            animation: "spin 1s linear infinite",
                            margin: "0 auto 12px"
                        }}></div>
                        <p style={{ textAlign: "center", fontSize: 13, color: "#00e5a0", margin: 0 }}>
                            🆔 Generating your did:key identity...
                        </p>
                    </div>
                )}

                {stage === 'complete' && (
                    <div style={{
                        marginBottom: 24,
                        padding: 16,
                        background: "rgba(0,229,160,0.05)",
                        borderRadius: 8,
                        border: "1px solid rgba(0,229,160,0.1)"
                    }}>
                        <p style={{ textAlign: "center", fontSize: 13, color: "#00e5a0", margin: 0 }}>
                            ✅ Identity ready! Redirecting...
                        </p>
                    </div>
                )}

                <button
                    onClick={handleDIDLogin}
                    disabled={isLoading || stage !== 'idle'}
                    style={{
                        width: "100%",
                        background: "linear-gradient(135deg, #00e5a0, #00c7e5)",
                        color: "#0a0a0f",
                        border: "none",
                        padding: "14px 20px",
                        borderRadius: 8,
                        cursor: (isLoading || stage !== 'idle') ? "not-allowed" : "pointer",
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 14,
                        fontWeight: 700,
                        opacity: (isLoading || stage !== 'idle') ? 0.6 : 1,
                        transition: "opacity 0.2s, transform 0.15s",
                        letterSpacing: "0.5px",
                    }}
                >
                    {stage === 'generating' ? 'Generating...' : '🚀 Enter with DID:Key'}
                </button>

                <div style={{ marginTop: 32, padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 8, fontSize: 12 }}>
                    <h4 style={{ margin: "0 0 12px 0", color: "#e4e4e7" }}>🌐 How it works:</h4>
                    <ol style={{ paddingLeft: 20, margin: "0 0 16px 0", color: "#a1a1aa", lineHeight: 1.8 }}>
                        <li><strong>Generate Key</strong> — An Ed25519 keypair is created in your browser</li>
                        <li><strong>Create DID</strong> — A <code style={{ color: "#00e5a0" }}>did:key</code> identifier is derived from your public key</li>
                        <li><strong>Store Locally</strong> — Your keys are saved in localStorage for this device</li>
                    </ol>
                    <p style={{ margin: 0, color: "#71717a", lineHeight: 1.5 }}>
                        💡 No server required. Your identity is fully self-sovereign and stored only on this device.
                        Returning users are automatically authenticated.
                    </p>
                </div>
            </div>

            <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
