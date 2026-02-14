export function Header() {
  return (
    <header style={{ padding: "12px 20px", borderBottom: "1px solid rgba(0,229,160,0.12)", display: "flex", alignItems: "center", background: "rgba(0,229,160,0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #00e5a0 0%, #0a0a0f 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⬡</div>
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>MESH WORKSPACE</div>
          <div style={{ fontSize: 10, color: "#71717a", letterSpacing: "0.05em" }}>DECENTRALIZED AGENT COLLABORATION</div>
        </div>
      </div>
    </header>
  );
}
