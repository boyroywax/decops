import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    plugins: [
        react(),
        // The wasm + top-level-await plugins are required for the
        // production browser bundle (didcomm, helia) but interact badly
        // with vitest's transform pipeline and hang test workers. Skip
        // them during `vitest` runs — the test setup mocks `didcomm`.
        ...(mode === 'test' ? [] : [wasm(), topLevelAwait()]),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
            manifest: {
                name: 'Decops Mesh Workspace',
                short_name: 'Decops',
                description: 'Decentralized Operations & AI Mesh Workspace',
                theme_color: '#0a0a0f',
                background_color: '#0a0a0f',
                display: 'standalone',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ]
            },
            workbox: {
                // didcomm + helia + noble push the main bundle past the
                // default 2 MiB precache limit. Raise to 8 MiB so the
                // service-worker manifest includes the full app shell.
                maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                navigateFallback: 'index.html',
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'gstatic-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    }
                ]
            }
        })
    ],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        // The `didcomm` package is a WASM-backed module whose top-level
        // initialisation hangs vitest's jsdom worker. It is mocked in
        // src/test/setup.ts; excluding it here prevents the deps optimiser
        // from trying to pre-bundle the real package.
        server: {
            deps: {
                external: ['didcomm'],
            },
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
    },
    server: {
        host: true,
        port: 5173,
        cors: true,
        watch: {
            usePolling: true
        },
        allowedHosts: [
            "5173--main--com-pcktlbs--pocketminers.coder.pocketlabs.dev",
            "4173--main--com-pcktlbs--pocketminers.coder.pocketlabs.dev"
        ],
        // NOTE: The previous Kubo / orbitdb-server CORS bypass proxies were
        // removed in docs/adr/0005-cors-proxy-removal.md. Remote daemons are
        // expected to send the correct Access-Control-* headers themselves;
        // see that ADR for the exact restoration recipe if needed.
    }
}))
