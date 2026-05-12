import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initializeToolkits } from './services/toolkits'
import { builtinModules } from './services/toolkits/builtins'
import './index.css'

// Side-effect import: registers every toolkit's bot chat-delegation and
// UI contributions in a single deterministic boot step. Adding a new
// toolkit is a single-line change inside `@/toolkits/index.ts`.
import '@/toolkits'

initializeToolkits(builtinModules);

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>,
)
import { registerPWA } from './pwa'

registerPWA()
