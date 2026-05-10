/**
 * Web Crawler capability toolkit module (external integration).
 *
 * Facets: metadata, tools, collections, logging, configuration, docs
 */

import type { ToolkitModule } from "../types";
import {
  fetchUrlCommand,
  extractLinksCommand,
  crawlSiteCommand,
} from "@/services/commands/definitions/web-crawler";

export const webCrawlerModule: ToolkitModule = {
  manifest: {
    id: "web-crawler",
    name: "Web Crawler",
    description:
      "Load URLs, crawl web pages, and extract content for analysis, research, and data gathering. Supports single-page fetch, multi-page crawl, and structured content extraction.",
    icon: "Globe",
    color: "#38bdf8",
    gradient: ["#38bdf8", "#60a5fa"],
    category: "data-ingestion",
    status: "available",
    tags: ["web", "crawl", "fetch", "scrape"],
    labels: { tier: "capability", domain: "data-ingestion" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  commands: [fetchUrlCommand, extractLinksCommand, crawlSiteCommand],
  tools: [
    {
      id: "fetch_url",
      name: "Fetch URL",
      description:
        "Load a single URL and extract its text content, metadata, and links.",
      inputSchema: {
        url: { type: "string", description: "The URL to fetch", required: true },
        format: {
          type: "string",
          description: "Output format: text, markdown, or html",
          default: "markdown",
        },
      },
    },
    {
      id: "crawl_site",
      name: "Crawl Site",
      description:
        "Recursively crawl a website starting from a root URL, following links up to a specified depth.",
      inputSchema: {
        url: { type: "string", description: "Root URL to start crawling", required: true },
        maxDepth: { type: "number", description: "Maximum link depth to follow", default: 2 },
        maxPages: { type: "number", description: "Maximum pages to crawl", default: 10 },
      },
    },
    {
      id: "extract_links",
      name: "Extract Links",
      description:
        "Extract and categorize all links from a web page (internal, external, resources).",
      inputSchema: {
        url: { type: "string", description: "URL to extract links from", required: true },
        filter: { type: "string", description: "Filter pattern for links (regex)", default: "" },
      },
    },
    {
      id: "screenshot_url",
      name: "Screenshot URL",
      description: "Capture a visual screenshot of a web page for analysis.",
      inputSchema: {
        url: { type: "string", description: "URL to screenshot", required: true },
        viewport: {
          type: "string",
          description: "Viewport size: mobile, tablet, desktop",
          default: "desktop",
        },
      },
    },
  ],

  collections: [
    {
      id: "crawl_results",
      name: "Crawl Results",
      description: "Cached web crawl results.",
      schema: [
        { name: "id", type: "string", required: true, unique: true },
        { name: "url", type: "string", required: true, indexed: true },
        { name: "content", type: "string" },
        { name: "links", type: "array" },
        { name: "crawledAt", type: "date" },
      ],
      primaryKey: "id",
      retention: { maxEntries: 500, maxAge: 86400000, policy: "fifo" },
    },
  ],

  logging: {
    config: { minLevel: "info", maxEntries: 200 },
    channels: [
      { id: "crawler.requests", name: "Crawl Requests", description: "URL fetch and crawl request events" },
    ],
  },

  configuration: {
    fields: [
      { key: "userAgent", label: "User Agent", description: "HTTP User-Agent header for requests", type: "string", defaultValue: "decops-crawler/1.0" },
      { key: "timeout", label: "Request Timeout (ms)", description: "Maximum time to wait for a response", type: "number", defaultValue: 10000 },
      { key: "respectRobotsTxt", label: "Respect robots.txt", description: "Honor robots.txt directives", type: "boolean", defaultValue: true },
    ],
  },

  docs: {
    documents: [
      { id: "crawler-readme", title: "Web Crawler", type: "readme", content: "# Web Crawler\n\nFetch, crawl, and extract content from web pages.", order: 1 },
    ],
    readme: "# Web Crawler Kit\n\nCapability toolkit for fetching and crawling web content.",
  },
};
