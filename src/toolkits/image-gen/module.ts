/**
 * Image Generation toolkit module.
 */

import type { ToolkitModule } from "@/services/toolkits/types";
import {
  generateImageCommand,
  generateAllImagesCommand,
  clearImageCacheCommand,
  generateIconCommand,
} from "./commands";

export const imageGenModule: ToolkitModule = {
  manifest: {
    id: "image-gen",
    name: "Image Generation",
    description:
      "Generate AI portraits, badges, and icons via Imagen 4.0. Batch-generate images and manage the image cache.",
    icon: "Image",
    color: "#ec4899",
    gradient: ["#ec4899", "#f472b6"],
    category: "ai",
    status: "available",
    builtIn: true,
    tags: ["image", "agent", "icon", "maintenance"],
    labels: { tier: "core", domain: "ai" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  commands: [
    generateImageCommand,
    generateAllImagesCommand,
    clearImageCacheCommand,
    generateIconCommand,
  ],
  // Curated direct LLM tools — image generation hot path. Cache management
  // and bulk batch-portrait generation stay registry-only.
  tools: [
    {
      id: "imagegen.generateImage",
      name: "Generate Image",
      description: "Generate an image from a text prompt.",
      commandId: "generate_image",
    },
    {
      id: "imagegen.generateIcon",
      name: "Generate Icon",
      description: "Generate a small icon/avatar from a text prompt.",
      commandId: "generate_icon",
    },
  ],

  jobs: [
    {
      id: "imagegen_batch_portraits",
      name: "Batch Generate Portraits",
      description: "Generate portraits for all agents that don't have one.",
      inputs: [
        { name: "style", type: "string", description: "Art style for portraits", defaultValue: "digital-art" },
      ],
      outputs: [
        { name: "generated", type: "number", description: "Number of portraits generated" },
      ],
      tags: ["batch", "portrait"],
    },
  ],

  collections: [
    {
      id: "image_cache",
      name: "Image Cache",
      description: "Cached generated images.",
      schema: [
        { name: "id", type: "string", required: true, unique: true },
        { name: "prompt", type: "string", required: true },
        { name: "model", type: "string" },
        { name: "dataUrl", type: "string", required: true },
        { name: "createdAt", type: "date" },
      ],
      primaryKey: "id",
      retention: { maxEntries: 200, policy: "lru" },
    },
  ],

  logging: {
    config: { minLevel: "info", maxEntries: 200 },
    channels: [
      { id: "imagegen.generation", name: "Image Generation", description: "Image generation requests and results" },
    ],
  },

  metrics: {
    definitions: [
      { name: "toolkit.imagegen.generated", description: "Images generated (cumulative)", type: "counter" },
      { name: "toolkit.imagegen.cache_size", description: "Cached images", type: "gauge" },
    ],
    collect: () => ({ "toolkit.imagegen.generated": 0, "toolkit.imagegen.cache_size": 0 }),
  },

  configuration: {
    fields: [
      { key: "defaultModel", label: "Image Model", description: "Default model for image generation", type: "select", defaultValue: "imagen-4.0", options: [
        { label: "Imagen 4.0", value: "imagen-4.0" },
        { label: "Imagen 3.0", value: "imagen-3.0" },
      ]},
      { key: "cacheEnabled", label: "Cache Images", description: "Cache generated images in localStorage", type: "boolean", defaultValue: true },
    ],
  },

  rbac: {
    permissions: [
      { id: "imagegen.generate", name: "Generate Images", description: "Generate images", resource: "image", actions: ["create"] },
      { id: "imagegen.cache", name: "Manage Cache", description: "Clear image cache", resource: "cache", actions: ["delete"] },
    ],
    roles: [
      { id: "imagegen-user", name: "Image Gen User", description: "Generate images", permissions: ["imagegen.generate"] },
      { id: "imagegen-admin", name: "Image Gen Admin", description: "Full image gen access", permissions: ["imagegen.generate", "imagegen.cache"] },
    ],
    defaultRole: "imagegen-user",
  },

  docs: {
    documents: [
      { id: "imagegen-readme", title: "Image Generation", type: "readme", content: "# Image Generation\n\nGenerate AI portraits, badges, and icons.", order: 1 },
    ],
    readme: "# Image Generation Kit\n\nAI-powered image generation using Imagen models.",
  },

  activity: { enabled: true },
};
