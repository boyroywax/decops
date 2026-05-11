sed -i '15a\
import { useRegisterLibp2pChatAgent } from "@/toolkits/libp2p/useRegisterLibp2pChatAgent";\
\
function GlobalRegistrar() {\
    useRegisterLibp2pChatAgent();\
    return null;\
}' src/context/CommandContextProvider.tsx
sed -i 's#<Ctx.Provider value={value}>{children}</Ctx.Provider>#<Ctx.Provider value={value}><GlobalRegistrar />{children}</Ctx.Provider>#' src/context/CommandContextProvider.tsx
