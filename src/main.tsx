import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initializeToolkits } from './services/toolkits'
import './index.css'

// Side-effect import: registers Studio Bot's chat delegation with the core AI service.
// This must run before any chat interactions so the delegation is available.
import './services/studioBot'

initializeToolkits();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>,
)
import { registerPWA } from './pwa'

registerPWA()
