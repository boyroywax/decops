sed -i 's/color: #ffffff;/color: var(--text-primary, #ffffff);/g' src/styles/components/chat-panel.css
sed -i 's/text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);/text-shadow: none;/g' src/styles/components/chat-panel.css
sed -i 's/color: rgba(255, 255, 255, 0.78);/color: var(--text-secondary, rgba(255, 255, 255, 0.78));/g' src/styles/components/chat-panel.css
sed -i 's/rgba(255, 255, 255, 0.08)/var(--border-default, rgba(255, 255, 255, 0.08))/g' src/styles/components/chat-panel.css
sed -i 's/color: #fff;/color: var(--text-primary, #fff);/g' src/styles/components/chat-panel.css
