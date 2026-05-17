import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    plugins: [
        react(),
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
        // Optional same-origin proxy to a remote Kubo HTTP RPC daemon that
        // doesn't send CORS headers. Set VITE_KUBO_PROXY_TARGET in your
        // environment (e.g. `https://kubo.ipfs.dvln.net`) and point the
        // toolkit at  http://localhost:5173/kubo-proxy/api/v0  to bypass CORS.
        proxy: process.env.VITE_KUBO_PROXY_TARGET
            ? {
                "/kubo-proxy": {
                    target: process.env.VITE_KUBO_PROXY_TARGET,
                    changeOrigin: true,
                    secure: true,
                    // Strip the /kubo-proxy prefix. If the user pasted the bare
                    // /kubo-proxy URL without /api/v0, transparently insert it
                    // so kubo-rpc-client's default endpoints (which may emit
                    // either /id or /api/v0/id depending on options) all work.
                    rewrite: (p) => {
                        const stripped = p.replace(/^\/kubo-proxy/, "");
                        if (stripped === "" || stripped === "/") return "/api/v0";
                        if (stripped.startsWith("/api/")) return stripped;
                        return `/api/v0${stripped}`;
                    },
                    configure: (proxy) => {
                        proxy.on("proxyReq", (proxyReq, req) => {
                            // eslint-disable-next-line no-console
                            console.log(
                                `[kubo-proxy] → ${req.method} ${proxyReq.path}  auth=${proxyReq.getHeader("authorization") ? "present" : "MISSING"}`,
                            );
                        });
                        proxy.on("proxyRes", (proxyRes, req) => {
                            // eslint-disable-next-line no-console
                            console.log(
                                `[kubo-proxy] ← ${proxyRes.statusCode} ${req.method} ${req.url}`,
                            );
                        });
                        proxy.on("error", (err, _req, _res) => {
                            // eslint-disable-next-line no-console
                            console.error(`[kubo-proxy] error:`, err);
                        });
                    },
                },
            }
            : undefined,
    }
})
