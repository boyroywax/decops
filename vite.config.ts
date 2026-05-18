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
        //
        // Likewise, set VITE_ORBITDB_SERVER_PROXY_TARGET (e.g.
        // `https://orbitdb.dvln.net`) to expose a remote orbitdb-server at
        // http://localhost:5173/orbitdb-server-proxy/api/v0 .
        proxy: (() => {
            const entries: Record<string, any> = {};
            if (process.env.VITE_KUBO_PROXY_TARGET) {
                entries["/kubo-proxy"] = {
                    target: process.env.VITE_KUBO_PROXY_TARGET,
                    changeOrigin: true,
                    secure: true,
                    rewrite: (p: string) => {
                        const stripped = p.replace(/^\/kubo-proxy/, "");
                        if (stripped === "" || stripped === "/") return "/api/v0";
                        if (stripped.startsWith("/api/")) return stripped;
                        return `/api/v0${stripped}`;
                    },
                    configure: (proxy: any) => {
                        proxy.on("proxyReq", (proxyReq: any, req: any) => {
                            // eslint-disable-next-line no-console
                            console.log(
                                `[kubo-proxy] → ${req.method} ${proxyReq.path}  auth=${proxyReq.getHeader("authorization") ? "present" : "MISSING"}`,
                            );
                        });
                        proxy.on("proxyRes", (proxyRes: any, req: any) => {
                            // eslint-disable-next-line no-console
                            console.log(
                                `[kubo-proxy] ← ${proxyRes.statusCode} ${req.method} ${req.url}`,
                            );
                        });
                        proxy.on("error", (err: any) => {
                            // eslint-disable-next-line no-console
                            console.error(`[kubo-proxy] error:`, err);
                        });
                    },
                };
            }
            if (process.env.VITE_ORBITDB_SERVER_PROXY_TARGET) {
                entries["/orbitdb-server-proxy"] = {
                    target: process.env.VITE_ORBITDB_SERVER_PROXY_TARGET,
                    changeOrigin: true,
                    secure: true,
                    rewrite: (p: string) => {
                        const stripped = p.replace(/^\/orbitdb-server-proxy/, "");
                        if (stripped === "" || stripped === "/") return "/api/v0";
                        if (stripped.startsWith("/api/")) return stripped;
                        return `/api/v0${stripped}`;
                    },
                    configure: (proxy: any) => {
                        proxy.on("proxyReq", (proxyReq: any, req: any) => {
                            // eslint-disable-next-line no-console
                            console.log(
                                `[orbitdb-server-proxy] → ${req.method} ${proxyReq.path}  auth=${proxyReq.getHeader("authorization") ? "present" : "MISSING"}`,
                            );
                        });
                        proxy.on("proxyRes", (proxyRes: any, req: any) => {
                            // eslint-disable-next-line no-console
                            console.log(
                                `[orbitdb-server-proxy] ← ${proxyRes.statusCode} ${req.method} ${req.url}`,
                            );
                        });
                        proxy.on("error", (err: any) => {
                            // eslint-disable-next-line no-console
                            console.error(`[orbitdb-server-proxy] error:`, err);
                        });
                    },
                };
            }
            return Object.keys(entries).length > 0 ? entries : undefined;
        })(),
    }
})
