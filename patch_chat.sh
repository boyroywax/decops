sed -i 's/Object.values(useChatAgentsStore.getState().agents)/Object.values(useChatAgentsStore(s => s.agents))/g' src/components/layout/ChatPanel.tsx
