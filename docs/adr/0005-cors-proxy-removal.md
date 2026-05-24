# ADR 0005 — Removal of dev-server CORS proxies for Kubo and orbitdb-server (Lagrange)

- **Status:** Accepted
- **Date:** 2026-05-19
- **Supersedes/touches:** `vite.config.ts` proxy block, Kubo & orbitdb-server toolkits

## Context

Browser apps hitting a remote Kubo HTTP RPC daemon (or our orbitdb-server / future
Lagrange) at a different origin run into CORS preflight failures unless the
remote sends the right `Access-Control-Allow-*` headers.

To unblock development, the dev server (`vite.config.ts`) used to expose two
same-origin tunnels:

| Route                       | Env var to enable                   | Target example                  |
| --------------------------- | ----------------------------------- | ------------------------------- |
| `/kubo-proxy/*`             | `VITE_KUBO_PROXY_TARGET`            | `https://kubo.ipfs.dvln.net`    |
| `/orbitdb-server-proxy/*`   | `VITE_ORBITDB_SERVER_PROXY_TARGET`  | `https://orbitdb.dvln.net`      |

Both stripped their prefix, rewrote `/` to `/api/v0`, set
`changeOrigin: true`, and logged every request. The toolkits' services
(`kuboService`, `orbitdbServerService`) detected a `TypeError: Failed to fetch`
to a same-origin URL containing the proxy prefix and surfaced a `PROXY-DOWN: …`
error so the UI could prompt the developer to restart the dev server with the
env var set.

## Decision

We **remove both proxies** and require the upstream daemons we control to
serve the right CORS headers directly. Concretely:

1. `vite.config.ts` no longer registers any `/kubo-proxy` or
   `/orbitdb-server-proxy` route, and no longer reads
   `VITE_KUBO_PROXY_TARGET` / `VITE_ORBITDB_SERVER_PROXY_TARGET`.
2. The Kubo and orbitdb-server services drop the `PROXY-DOWN` branch in
   their network-error classifiers and keep only the CORS / generic
   network paths.
3. The toolkit views remove the "Option B — dev proxy" hint blocks and
   the standalone CORS toggle button on `KuboView`; the only remedy
   surfaced to the user is daemon-side CORS configuration.
4. The orbitdb-server (Lagrange) bot system prompt drops its
   "PROXY-DOWN" / `VITE_ORBITDB_SERVER_PROXY_TARGET` guidance.

### Required CORS configuration on the Kubo daemon

Run once on the daemon host (then restart `ipfs daemon`):

```bash
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["GET","POST","PUT","OPTIONS"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers '["Authorization","Content-Type","X-Requested-With"]'
```

`"*"` for `Allow-Origin` is acceptable here because:

- The RPC is gated by `API.Authorizations` (Bearer token), not by cookies,
  so a wildcard origin does not expose the daemon to drive-by sites.
- `Access-Control-Allow-Credentials: true` is **not** set (and must not be,
  since it is incompatible with `*` in CORS).

### Required configuration on Lagrange / orbitdb-server

Bake CORS middleware into the server itself, e.g.:

```ts
app.use(cors({
    origin: true, // or an explicit list of allowed origins
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: false,
}));
```

## Rationale

- The proxy was a developer-only escape hatch. It did not help production
  builds (`npm run build`, PWA, deployed app), where same-origin tunnelling
  is not available.
- It introduced a confusing dual-mode model in the UI (CORS toggle, two
  endpoint shapes, `PROXY-DOWN` error branch, env vars that had to match
  the URL).
- CORS and authentication are independent: `Authorization: Bearer …` is
  still required and still validated by the daemon, regardless of CORS.
  Configuring `Allow-Origin: *` does not weaken auth.
- We control both backends in question (Kubo on `kubo.ipfs.dvln.net`,
  Lagrange when it ships). Once-only CORS config on the server side is
  strictly less moving-parts than a per-developer dev-server env var.

## Consequences

- Connecting to a third-party Kubo daemon that doesn't expose CORS is no
  longer possible from the browser app; the user must either fix CORS on
  that daemon, or proxy it themselves at the infra layer (nginx, Caddy,
  Cloudflare Worker, etc.).
- The `VITE_KUBO_PROXY_TARGET` / `VITE_ORBITDB_SERVER_PROXY_TARGET` env
  vars are now ignored. They can be removed from any local `.env`,
  shell aliases, and `npm run dev` invocations.

## Restoring the proxy (if ever needed)

The proxy was a thin wrapper around vite's built-in `server.proxy`
options. To restore it for Kubo:

```ts
// vite.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    // …
    server: {
        host: true,
        port: 5173,
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
                        proxy.on("proxyReq", (req: any, r: any) => {
                            console.log(
                                `[kubo-proxy] → ${r.method} ${req.path}  ` +
                                `auth=${req.getHeader("authorization") ? "present" : "MISSING"}`,
                            );
                        });
                        proxy.on("proxyRes", (res: any, r: any) => {
                            console.log(`[kubo-proxy] ← ${res.statusCode} ${r.method} ${r.url}`);
                        });
                        proxy.on("error", (err: any) => console.error("[kubo-proxy] error:", err));
                    },
                };
            }
            return Object.keys(entries).length > 0 ? entries : undefined;
        })(),
    },
});
```

For orbitdb-server / Lagrange, duplicate the block with:

- env var `VITE_ORBITDB_SERVER_PROXY_TARGET`
- route prefix `/orbitdb-server-proxy`
- log tag `[orbitdb-server-proxy]`

Usage: start the dev server with the env var set to the upstream origin,
then point the toolkit's API URL at `http://localhost:5173/kubo-proxy`
(or `/orbitdb-server-proxy`). The rewrite ensures both
`/kubo-proxy` and `/kubo-proxy/api/v0/…` end up as `/api/v0/…` on the
upstream.

To resurrect the matching UX (CORS toggle button, `PROXY-DOWN` error
detection) consult the prior git history of:

- `src/toolkits/kubo/components/KuboView.tsx`
  (CORS toggle button, `lastDirectUrlRef`, `onToggleCors`, proxy-down
  error pane)
- `src/toolkits/kubo/service.ts`
  (`looksLikeProxyDown` branch in the `connect()` catch block)
- `src/toolkits/orbitdb-server/components/OrbitdbServerView.tsx`
  (proxy-down error pane)
- `src/toolkits/orbitdb-server/service.ts`
  (`classifyNetworkError` proxy-down branch)
- `src/toolkits/orbitdb-server/orbitdbServerBot.ts`
  (rule #7 about `VITE_ORBITDB_SERVER_PROXY_TARGET`)
