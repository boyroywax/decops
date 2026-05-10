/**
 * Built-in toolkit modules — all shipped with the platform.
 *
 * To add a new built-in toolkit:
 *   1. Create a new file in this directory exporting a ToolkitModule.
 *   2. Import and add it to the `builtinModules` array below.
 *   3. If it introduces a new ToolkitId, add the literal to ToolkitId in types/index.ts.
 */

import type { ToolkitModule } from "../types";

// ── Command-group toolkits ─────────────────────
import { agentManagementModule } from "./agent-management";
import { infrastructureModule } from "./infrastructure";
import { ecosystemModule } from "./ecosystem";
import { autonomyModule } from "./autonomy";
import { artifactsModule } from "./artifacts";
import { studioModule } from "@/toolkits/studio";
import { jobsModule } from "./jobs";
import { imageGenModule } from "@/toolkits/image-gen";
import { libp2pModule } from "@/toolkits/libp2p";
import { workspaceMgmtModule } from "./workspace-mgmt";
import { loggingModule } from "./logging";

// ── Capability toolkits (external integrations) ─
import { webCrawlerModule } from "./web-crawler";
import { ocrModule } from "./ocr";
import { audioToTextModule } from "./audio-to-text";
import { videoToTextModule } from "./video-to-text";

/**
 * Ordered list of all built-in toolkit modules.
 * Registration order matches the original TOOLKITS constant order.
 */
export const builtinModules: ToolkitModule[] = [
  // Core platform toolkits (register first — others may depend on them)
  loggingModule,
  // Command-group toolkits
  agentManagementModule,
  infrastructureModule,
  ecosystemModule,
  autonomyModule,
  artifactsModule,
  studioModule,
  jobsModule,
  imageGenModule,
  libp2pModule,
  workspaceMgmtModule,
  // Capability toolkits
  webCrawlerModule,
  ocrModule,
  audioToTextModule,
  videoToTextModule,
];

// Re-export individual modules for targeted imports
export {
  loggingModule,
  agentManagementModule,
  infrastructureModule,
  ecosystemModule,
  autonomyModule,
  artifactsModule,
  studioModule,
  jobsModule,
  imageGenModule,
  libp2pModule,
  workspaceMgmtModule,
  webCrawlerModule,
  ocrModule,
  audioToTextModule,
  videoToTextModule,
};
