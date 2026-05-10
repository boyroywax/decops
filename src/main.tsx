import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initializeToolkits } from './services/toolkits'
import { builtinModules } from './services/toolkits/builtins'
import './index.css'

// Side-effect import: registers Studio Bot's chat delegation with the core AI service.
// This must run before any chat interactions so the delegation is available.
import '@/toolkits/studio/studioBot'

// Side-effect imports: register toolkit UI contributions (providers, views, globals)
// with the runtime UI registry before the app renders.
import '@/toolkits/studio/register'
import '@/toolkits/editor/register'
import '@/toolkits/libp2p/register'

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
