sed -i 's/const target = Math.min(/return window.innerWidth \/ 3;/g' src/components/layout/ChatPanel.tsx
sed -i '/activeAgent.preferredSideWidth,/d' src/components/layout/ChatPanel.tsx
sed -i '/Math.max(window.innerWidth \* 0.5, 900),/d' src/components/layout/ChatPanel.tsx
sed -i '/return Math.min(target, window.innerWidth - 320);/d' src/components/layout/ChatPanel.tsx
