sed -i 's/border: 1px solid #1f2937;/border: 1px solid var(--border-default, #1f2937);/g' src/toolkits/libp2p/styles/libp2p.css
sed -i 's/background: #0b1220;/background: var(--bg-surface, #0b1220);/g' src/toolkits/libp2p/styles/libp2p.css
sed -i 's/border-color: #475569;/border-color: var(--border-active, #475569);/g' src/toolkits/libp2p/styles/libp2p.css
sed -i 's/background: #111827;/background: var(--bg-active, #111827);/g' src/toolkits/libp2p/styles/libp2p.css
