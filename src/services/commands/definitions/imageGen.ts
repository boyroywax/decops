
import { CommandDefinition } from "../types";
import { generatePortrait, hasGeminiApiKey, type ImageStyle } from "../../imageGen";
import {
    setCachedPortrait,
    getCachedPortrait,
    promptHash,
    clearPortraitCache,
    type CachedPortrait,
} from "../../portraitCache";

// ── generate_image ──

export const generateImageCommand: CommandDefinition = {
    id: "generate_image",
    description: "Generates an AI image via Imagen 4.0. Supports agent portraits, group badges, and custom prompts. Results are cached in IndexedDB.",
    tags: ["image", "agent", "workspace"],
    rbac: ["orchestrator", "builder", "curator"],
    recommendedModel: "imagen-4.0-generate-001",
    args: {
        target: {
            name: "target",
            type: "string",
            description: 'What to generate: "agent_portrait", "group_badge", or "custom"',
            required: true,
            validation: (val) =>
                ["agent_portrait", "group_badge", "custom"].includes(val) ||
                'Must be "agent_portrait", "group_badge", or "custom"',
        },
        prompt: {
            name: "prompt",
            type: "string",
            description: "Text prompt describing the image to generate. For agent/group targets this is auto-built if omitted.",
            required: false,
            defaultValue: "",
        },
        entityId: {
            name: "entityId",
            type: "string",
            description: "Agent ID or Group ID to generate the image for (required for agent_portrait / group_badge targets).",
            required: false,
        },
        style: {
            name: "style",
            type: "string",
            description: 'Image style: "portrait" (headshot) or "badge" (emblem/icon). Defaults based on target.',
            required: false,
            defaultValue: "portrait",
            validation: (val) =>
                ["portrait", "badge"].includes(val) || 'Must be "portrait" or "badge"',
        },
        force: {
            name: "force",
            type: "boolean",
            description: "If true, regenerates even if a cached image exists.",
            required: false,
            defaultValue: false,
        },
    },
    output: "JSON object with image metadata: cacheKey, mimeType, byteSize, cached status.",
    outputSchema: {
        type: "object",
        properties: {
            cacheKey: { type: "string", description: "IndexedDB cache key" },
            mimeType: { type: "string" },
            byteSize: { type: "number" },
            cached: { type: "boolean" },
            prompt: { type: "string", description: "Final prompt used" },
        },
    },
    execute: async (args, context) => {
        const { target, prompt: userPrompt, entityId, style: styleArg, force } = args;
        const { workspace } = context;

        // Validate Gemini API key
        if (!hasGeminiApiKey()) {
            throw new Error("No Gemini API key configured. Go to Profile & Settings to add one.");
        }

        let finalPrompt = userPrompt || "";
        let imageStyle: ImageStyle = (styleArg as ImageStyle) || "portrait";
        let cacheKey = "";

        // ── Build prompt from entity data ──
        if (target === "agent_portrait") {
            if (!entityId) throw new Error("entityId is required for agent_portrait target.");
            const agent = workspace.agents.find((a: any) => a.id === entityId);
            if (!agent) throw new Error(`Agent not found: ${entityId}`);

            imageStyle = "portrait";
            cacheKey = agent.id;

            if (!finalPrompt) {
                const phys = agent.aieos?.physicality;
                const base = phys?.image_prompts?.portrait || "";
                if (base) {
                    finalPrompt = base;
                } else if (phys) {
                    const parts = [
                        phys.face?.shape && `${phys.face.shape} face`,
                        phys.face?.eyes?.color && `${phys.face.eyes.color} eyes`,
                        phys.face?.hair?.color &&
                            `${phys.face.hair.color} ${phys.face.hair.style || "hair"}`,
                        phys.style?.aesthetic_archetype,
                    ].filter(Boolean);
                    finalPrompt = parts.length > 0 ? parts.join(", ") : `AI agent portrait, ${agent.role} role`;
                } else {
                    finalPrompt = `AI agent portrait, ${agent.role} role`;
                }
            }
        } else if (target === "group_badge") {
            if (!entityId) throw new Error("entityId is required for group_badge target.");
            const group = workspace.groups.find((g: any) => g.id === entityId);
            if (!group) throw new Error(`Group not found: ${entityId}`);

            imageStyle = "badge";
            cacheKey = `group-${group.id}`;

            if (!finalPrompt) {
                const memberRoles = [...new Set(
                    group.members
                        .map((mid: string) => workspace.agents.find((a: any) => a.id === mid))
                        .filter(Boolean)
                        .map((a: any) => a.role),
                )];
                finalPrompt = `emblem badge icon for a group called "${group.name}", ${group.governance} governance, ${memberRoles.join(", ")} roles, ${group.members.length} members`;
            }
        } else if (target === "custom") {
            if (!finalPrompt) throw new Error("prompt is required for custom target.");
            cacheKey = `custom-${crypto.randomUUID().slice(0, 8)}`;
            imageStyle = (styleArg as ImageStyle) || "portrait";
        }

        workspace.addLog(`Generating ${target} image${entityId ? ` for ${entityId.slice(0, 8)}…` : ""}…`);

        // ── Generate via Imagen 4.0 ──
        const result = await generatePortrait(finalPrompt, imageStyle);

        // ── Cache the result ──
        const pHash = promptHash(finalPrompt);
        const entry: CachedPortrait = {
            data: result.data,
            mimeType: result.mimeType,
            promptHash: pHash,
            cachedAt: new Date().toISOString(),
        };
        await setCachedPortrait(cacheKey, entry);

        const byteSize = Math.ceil((result.data.length * 3) / 4); // base64 → bytes

        workspace.addLog(`Image generated: ${result.mimeType}, ${(byteSize / 1024).toFixed(0)} KB, cached as ${cacheKey}`);

        return {
            cacheKey,
            mimeType: result.mimeType,
            byteSize,
            cached: true,
            prompt: finalPrompt,
        };
    },
};

// ── generate_all_images ──

export const generateAllImagesCommand: CommandDefinition = {
    id: "generate_all_images",
    description: "Batch-generates images for all agents and/or groups that don't have cached images yet.",
    tags: ["image", "agent", "workspace"],
    rbac: ["orchestrator", "builder", "curator"],
    recommendedModel: "imagen-4.0-generate-001",
    args: {
        targets: {
            name: "targets",
            type: "string",
            description: 'Comma-separated list of targets: "agents", "groups", or "all" (default: "all").',
            required: false,
            defaultValue: "all",
            validation: (val) => {
                const valid = ["all", "agents", "groups"];
                const parts = val.split(",").map((s: string) => s.trim());
                return parts.every((p: string) => valid.includes(p)) || 'Must be comma-separated: "agents", "groups", or "all"';
            },
        },
        force: {
            name: "force",
            type: "boolean",
            description: "If true, regenerates all images even if cached versions exist.",
            required: false,
            defaultValue: false,
        },
    },
    output: "JSON object with generation results: total, succeeded, failed, skipped counts.",
    outputSchema: {
        type: "object",
        properties: {
            total: { type: "number" },
            succeeded: { type: "number" },
            failed: { type: "number" },
            skipped: { type: "number" },
            results: { type: "array" },
        },
    },
    execute: async (args, context) => {
        const { targets: targetsArg, force } = args;
        const { workspace } = context;

        if (!hasGeminiApiKey()) {
            throw new Error("No Gemini API key configured. Go to Profile & Settings to add one.");
        }

        const targetList = (targetsArg || "all").split(",").map((s: string) => s.trim());
        const doAgents = targetList.includes("all") || targetList.includes("agents");
        const doGroups = targetList.includes("all") || targetList.includes("groups");

        const items: Array<{ cacheKey: string; prompt: string; style: ImageStyle; label: string }> = [];

        // Build agent items
        if (doAgents) {
            for (const agent of workspace.agents) {
                const phys = (agent as any).aieos?.physicality;
                const base = phys?.image_prompts?.portrait || "";
                let prompt: string;
                if (base) {
                    prompt = base;
                } else if (phys) {
                    const parts = [
                        phys.face?.shape && `${phys.face.shape} face`,
                        phys.face?.eyes?.color && `${phys.face.eyes.color} eyes`,
                        phys.face?.hair?.color && `${phys.face.hair.color} ${phys.face.hair.style || "hair"}`,
                        phys.style?.aesthetic_archetype,
                    ].filter(Boolean);
                    prompt = parts.length > 0 ? parts.join(", ") : `AI agent portrait, ${(agent as any).role} role`;
                } else {
                    prompt = `AI agent portrait, ${(agent as any).role} role`;
                }
                items.push({ cacheKey: (agent as any).id, prompt, style: "portrait", label: `Agent: ${(agent as any).name}` });
            }
        }

        // Build group items
        if (doGroups) {
            for (const group of workspace.groups) {
                const g = group as any;
                const memberRoles = [...new Set(
                    g.members
                        .map((mid: string) => workspace.agents.find((a: any) => a.id === mid))
                        .filter(Boolean)
                        .map((a: any) => a.role),
                )];
                const prompt = `emblem badge icon for a group called "${g.name}", ${g.governance} governance, ${memberRoles.join(", ")} roles, ${g.members.length} members`;
                items.push({ cacheKey: `group-${g.id}`, prompt, style: "badge", label: `Group: ${g.name}` });
            }
        }

        workspace.addLog(`Generating images for ${items.length} entities (force=${force})…`);

        let succeeded = 0;
        let failed = 0;
        let skipped = 0;
        const results: Array<{ key: string; label: string; status: string; error?: string }> = [];

        for (const item of items) {
            try {
                // Check cache (skip if not forcing)
                if (!force) {
                    const { getCachedPortrait } = await import("../../portraitCache");
                    const pHash = promptHash(item.prompt);
                    const cached = await getCachedPortrait(item.cacheKey, pHash);
                    if (cached) {
                        skipped++;
                        results.push({ key: item.cacheKey, label: item.label, status: "skipped" });
                        continue;
                    }
                }

                const result = await generatePortrait(item.prompt, item.style);
                const pHash = promptHash(item.prompt);
                await setCachedPortrait(item.cacheKey, {
                    data: result.data,
                    mimeType: result.mimeType,
                    promptHash: pHash,
                    cachedAt: new Date().toISOString(),
                });
                succeeded++;
                results.push({ key: item.cacheKey, label: item.label, status: "generated" });
                workspace.addLog(`✓ ${item.label}`);
            } catch (err: any) {
                failed++;
                results.push({ key: item.cacheKey, label: item.label, status: "failed", error: err.message });
                workspace.addLog(`✗ ${item.label}: ${err.message}`);
            }
        }

        workspace.addLog(`Image generation complete: ${succeeded} generated, ${skipped} skipped, ${failed} failed.`);

        return { total: items.length, succeeded, failed, skipped, results };
    },
};

// ── clear_image_cache ──

export const clearImageCacheCommand: CommandDefinition = {
    id: "clear_image_cache",
    description: "Clears all cached AI-generated images from IndexedDB. Portraits and badges will regenerate on next view.",
    tags: ["image", "maintenance"],
    rbac: ["orchestrator", "builder", "curator"],
    recommendedModel: "imagen-4.0-generate-001",
    args: {},
    output: "Confirmation message.",
    execute: async (_args, context) => {
        await clearPortraitCache();
        context.workspace.addLog("Image cache cleared. Portraits and badges will regenerate on next view.");
        return { cleared: true, message: "All cached images cleared." };
    },
};

// ── generate_icon ──

export const generateIconCommand: CommandDefinition = {
    id: "generate_icon",
    description:
        "Generates a unique AI icon/badge for a job, command, or automation via Imagen 4.0. " +
        "The generated icon is cached in IndexedDB and returned as a base64 data-URI.",
    tags: ["image", "icon", "job", "command", "automation"],
    rbac: ["orchestrator", "builder", "curator"],
    recommendedModel: "imagen-4.0-generate-001",
    args: {
        target: {
            name: "target",
            type: "string",
            description: 'What to generate an icon for: "job", "command", or "automation".',
            required: true,
            validation: (val) =>
                ["job", "command", "automation"].includes(val) ||
                'Must be "job", "command", or "automation"',
        },
        name: {
            name: "name",
            type: "string",
            description: "The name of the job/command/automation — used to build the prompt.",
            required: true,
        },
        description: {
            name: "description",
            type: "string",
            description: "Description of the job/command/automation — enriches the prompt for a more relevant icon.",
            required: false,
            defaultValue: "",
        },
        tags: {
            name: "tags",
            type: "string",
            description: "Comma-separated tags to further describe the subject (e.g. 'deploy,network,ai').",
            required: false,
            defaultValue: "",
        },
        force: {
            name: "force",
            type: "boolean",
            description: "If true, regenerates even if a cached icon exists.",
            required: false,
            defaultValue: false,
        },
    },
    output: "JSON object with the generated icon data-URI and cache metadata.",
    outputSchema: {
        type: "object",
        properties: {
            dataUri: { type: "string", description: "data:image/png;base64,…  ready to use in <img> or CSS" },
            cacheKey: { type: "string" },
            byteSize: { type: "number" },
            cached: { type: "boolean" },
        },
    },
    execute: async (args, context) => {
        const { target, name, description: desc, tags: tagsArg, force } = args;
        const { workspace } = context;

        if (!hasGeminiApiKey()) {
            throw new Error("No Gemini API key configured. Go to Profile & Settings to add one.");
        }

        // Build a descriptive prompt
        const tagList = tagsArg ? tagsArg.split(",").map((t: string) => t.trim()).filter(Boolean) : [];
        const tagStr = tagList.length ? `, themes: ${tagList.join(", ")}` : "";
        const descStr = desc ? ` — ${desc}` : "";
        const prompt = `icon for a ${target} called "${name}"${descStr}${tagStr}`;

        const cacheKey = `icon-${target}-${name.toLowerCase().replace(/\s+/g, "-")}`;
        const pHash = promptHash(prompt);

        // Check cache
        if (!force) {
            const cached = await getCachedPortrait(cacheKey, pHash);
            if (cached) {
                workspace.addLog(`Icon for "${name}" loaded from cache.`);
                return {
                    dataUri: `data:${cached.mimeType};base64,${cached.data}`,
                    cacheKey,
                    byteSize: Math.ceil((cached.data.length * 3) / 4),
                    cached: true,
                };
            }
        }

        workspace.addLog(`Generating icon for ${target}: "${name}"…`);

        const result = await generatePortrait(prompt, "badge");

        // Cache result
        const entry: CachedPortrait = {
            data: result.data,
            mimeType: result.mimeType,
            promptHash: pHash,
            cachedAt: new Date().toISOString(),
        };
        await setCachedPortrait(cacheKey, entry);

        const byteSize = Math.ceil((result.data.length * 3) / 4);
        const dataUri = `data:${result.mimeType};base64,${result.data}`;

        workspace.addLog(`Icon generated for "${name}": ${result.mimeType}, ${(byteSize / 1024).toFixed(0)} KB`);

        return { dataUri, cacheKey, byteSize, cached: false };
    },
};
