sed -i 's/background: rgba(255, 255, 255, 0.03);/background: var(--bg-surface, rgba(255, 255, 255, 0.03));/g' src/toolkits/libp2p/styles/libp2p.css
sed -i 's/border: 1px solid rgba(255, 255, 255, 0.06);/border: 1px solid var(--border-default, rgba(255, 255, 255, 0.06));/g' src/toolkits/libp2p/styles/libp2p.css
