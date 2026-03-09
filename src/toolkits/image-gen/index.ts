/**
 * Image Generation Toolkit — barrel export.
 *
 * Public API for the image-gen toolkit.
 * All consumers should import from `@/toolkits/image-gen`.
 */

// Service
export {
    generatePortrait, hasGeminiApiKey,
    getGeminiApiKey, setGeminiApiKey,
    getPortraitOptions, setPortraitOptions,
    setActiveStylePrefixes, getPortraitStylePrefix, getBadgeStylePrefix,
} from "./imageGen";
export type { GeneratedImage, ImageStyle, PortraitOptions } from "./imageGen";

// Cache
export {
    getCachedPortrait, setCachedPortrait,
    removeCachedPortrait, clearPortraitCache,
    promptHash,
} from "./portraitCache";
export type { CachedPortrait } from "./portraitCache";

// Commands
export {
    generateImageCommand, generateAllImagesCommand,
    clearImageCacheCommand, generateIconCommand,
} from "./commands";

// Toolkit module
export { imageGenModule } from "./module";
