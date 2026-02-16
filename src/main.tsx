import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initializeRegistry } from './services/commands/init'
import './index.css'

initializeRegistry();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
import { registerPWA } from './pwa'

registerPWA()
