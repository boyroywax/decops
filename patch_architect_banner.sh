sed -i 's/background: rgba(255, 255, 255, 0.05);/background: var(--bg-surface, rgba(255, 255, 255, 0.05));/g' src/toolkits/architect/styles/architect-popup.css
sed -i 's/border: 1px solid rgba(253, 230, 138, 0.18);/border: 1px solid var(--border-default, rgba(253, 230, 138, 0.18));/g' src/toolkits/architect/styles/architect-popup.css
sed -i 's/color: rgba(255, 255, 255, 0.78);/color: var(--text-secondary, rgba(255, 255, 255, 0.78));/g' src/toolkits/architect/styles/architect-popup.css
sed -i 's/color: #fff;/color: var(--text-primary, #fff);/g' src/toolkits/architect/styles/architect-popup.css
sed -i 's/color: rgba(255, 255, 255, 0.6);/color: var(--text-muted, rgba(255, 255, 255, 0.6));/g' src/toolkits/architect/styles/architect-popup.css
sed -i 's/color: rgba(255, 255, 255, 0.65);/color: var(--text-muted, rgba(255, 255, 255, 0.65));/g' src/toolkits/architect/styles/architect-popup.css
