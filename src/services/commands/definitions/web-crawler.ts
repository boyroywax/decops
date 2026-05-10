import { CommandDefinition } from "@/services/commands/types";

/**
 * Web Crawler commands — backs the `web-crawler` toolkit.
 *
 * Implementation note: browsers can't fetch arbitrary cross-origin URLs.
 * We use the Jina AI Reader proxy (https://r.jina.ai/) which returns the
 * page as Markdown and sets permissive CORS headers, so it works from any
 * origin without an API key.
 */

const READER_BASE = "https://r.jina.ai/";

function normalizeUrl(input: string): string {
    let url = String(input || "").trim();
    if (!url) throw new Error("URL is required");
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    // Reject obvious local/private targets to limit SSRF surface.
    const lower = url.toLowerCase();
    if (
        /^https?:\/\/(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|192\.168\.|::1)/.test(lower)
    ) {
        throw new Error("Refusing to fetch local/private URL");
    }
    return url;
}

async function readerFetch(url: string, signal?: AbortSignal): Promise<string> {
    const res = await fetch(`${READER_BASE}${url}`, {
        method: "GET",
        headers: { Accept: "text/plain" },
        signal,
    });
    if (!res.ok) {
        throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }
    return await res.text();
}

export const fetchUrlCommand: CommandDefinition = {
    id: "fetch_url",
    description: "Fetch a single URL and return its content as Markdown (uses the Jina Reader proxy for CORS-safe extraction).",
    tags: ["web", "crawl", "fetch"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {
        url: { name: "url", type: "string", description: "The URL to fetch", required: true },
        format: {
            name: "format",
            type: "string",
            description: "Output format (currently only 'markdown' is supported; 'text'/'html' fall back to markdown)",
            required: false,
            defaultValue: "markdown",
        },
        maxChars: {
            name: "maxChars",
            type: "number",
            description: "Truncate the returned content to this many characters (default 20000)",
            required: false,
            defaultValue: 20000,
        },
    },
    output: "The fetched page content as Markdown text.",
    outputSchema: {
        type: "object",
        properties: {
            url: { type: "string" },
            content: { type: "string" },
            length: { type: "number" },
            truncated: { type: "boolean" },
        },
    },
    execute: async (args, context) => {
        const url = normalizeUrl(args.url);
        const maxChars = Number(args.maxChars) || 20000;

        const ac = new AbortController();
        const timeout = setTimeout(() => ac.abort(), 20000);
        try {
            const raw = await readerFetch(url, ac.signal);
            const truncated = raw.length > maxChars;
            const content = truncated ? raw.slice(0, maxChars) : raw;
            context.workspace.addLog(
                `[web-crawler] fetch_url ${url} → ${raw.length} chars${truncated ? ` (truncated to ${maxChars})` : ""}`
            );
            return { url, content, length: raw.length, truncated };
        } finally {
            clearTimeout(timeout);
        }
    },
};

export const extractLinksCommand: CommandDefinition = {
    id: "extract_links",
    description: "Fetch a URL and extract all unique links from its content.",
    tags: ["web", "crawl", "links"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {
        url: { name: "url", type: "string", description: "The URL to extract links from", required: true },
        filter: {
            name: "filter",
            type: "string",
            description: "Optional regex pattern; only links matching the pattern are returned",
            required: false,
            defaultValue: "",
        },
    },
    output: "An object with the source URL and an array of extracted links.",
    outputSchema: {
        type: "object",
        properties: {
            url: { type: "string" },
            links: { type: "array", items: { type: "string" } },
            count: { type: "number" },
        },
    },
    execute: async (args, context) => {
        const url = normalizeUrl(args.url);
        const ac = new AbortController();
        const timeout = setTimeout(() => ac.abort(), 20000);
        try {
            const content = await readerFetch(url, ac.signal);
            // Markdown link pattern + bare https URLs
            const mdLink = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
            const bareUrl = /\bhttps?:\/\/[^\s)<>"']+/g;
            const found = new Set<string>();
            let m: RegExpExecArray | null;
            while ((m = mdLink.exec(content))) found.add(m[1]);
            while ((m = bareUrl.exec(content))) found.add(m[0]);

            let links = Array.from(found);
            if (args.filter) {
                try {
                    const re = new RegExp(args.filter);
                    links = links.filter((l) => re.test(l));
                } catch {
                    // Invalid regex — return all
                }
            }
            context.workspace.addLog(`[web-crawler] extract_links ${url} → ${links.length} link(s)`);
            return { url, links, count: links.length };
        } finally {
            clearTimeout(timeout);
        }
    },
};

export const crawlSiteCommand: CommandDefinition = {
    id: "crawl_site",
    description: "Crawl a website starting from a root URL, following same-origin links breadth-first up to a depth/page limit.",
    tags: ["web", "crawl"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {
        url: { name: "url", type: "string", description: "Root URL to start crawling", required: true },
        maxDepth: { name: "maxDepth", type: "number", description: "Maximum link depth to follow (default 1)", required: false, defaultValue: 1 },
        maxPages: { name: "maxPages", type: "number", description: "Maximum pages to crawl (default 5)", required: false, defaultValue: 5 },
    },
    output: "An array of crawled page summaries.",
    outputSchema: {
        type: "object",
        properties: {
            root: { type: "string" },
            pages: { type: "array" },
            count: { type: "number" },
        },
    },
    execute: async (args, context) => {
        const root = normalizeUrl(args.url);
        const maxDepth = Math.max(0, Math.min(Number(args.maxDepth) || 1, 3));
        const maxPages = Math.max(1, Math.min(Number(args.maxPages) || 5, 25));
        const rootHost = new URL(root).host;

        const visited = new Set<string>();
        const pages: { url: string; depth: number; chars: number; preview: string }[] = [];
        const queue: { url: string; depth: number }[] = [{ url: root, depth: 0 }];

        while (queue.length > 0 && pages.length < maxPages) {
            const { url, depth } = queue.shift()!;
            if (visited.has(url)) continue;
            visited.add(url);

            const ac = new AbortController();
            const timeout = setTimeout(() => ac.abort(), 15000);
            let content = "";
            try {
                content = await readerFetch(url, ac.signal);
            } catch (e: any) {
                context.workspace.addLog(`[web-crawler] crawl_site skip ${url}: ${e.message}`);
                clearTimeout(timeout);
                continue;
            }
            clearTimeout(timeout);

            pages.push({
                url,
                depth,
                chars: content.length,
                preview: content.slice(0, 400),
            });

            if (depth < maxDepth) {
                const mdLink = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
                let m: RegExpExecArray | null;
                while ((m = mdLink.exec(content))) {
                    const next = m[1];
                    try {
                        if (new URL(next).host === rootHost && !visited.has(next)) {
                            queue.push({ url: next, depth: depth + 1 });
                        }
                    } catch { /* ignore malformed */ }
                }
            }
        }

        context.workspace.addLog(`[web-crawler] crawl_site ${root} → ${pages.length} page(s)`);
        return { root, pages, count: pages.length };
    },
};
