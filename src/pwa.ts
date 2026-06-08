import { registerSW } from 'virtual:pwa-register'
import { logAggregator } from '@/services/logging'

export function registerPWA() {
    registerSW({
        onNeedRefresh() {
            // Show a prompt to user to refresh?
            // For now, we use autoUpdate so this might not hit often unless we change config
            logAggregator.log('info', 'New content available, reload to update.', { channel: 'pwa' })
        },
        onOfflineReady() {
            logAggregator.log('info', 'App is ready to work offline.', { channel: 'pwa' })
        },
    })
}
