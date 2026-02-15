import { registerSW } from 'virtual:pwa-register'

export function registerPWA() {
    const updateSW = registerSW({
        onNeedRefresh() {
            // Show a prompt to user to refresh?
            // For now, we use autoUpdate so this might not hit often unless we change config
            console.log('New content available, click on reload button to update.')
        },
        onOfflineReady() {
            console.log('App is ready to work offline.')
        },
    })
}
