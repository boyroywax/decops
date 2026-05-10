/**
 * Video to Text capability toolkit module (external integration).
 *
 * Facets: metadata, tools, docs
 */

import type { ToolkitModule } from "../types";

export const videoToTextModule: ToolkitModule = {
  manifest: {
    id: "video-to-text",
    name: "Video to Text",
    description:
      "Extract transcripts, frame descriptions, and metadata from video content.",
    icon: "Video",
    color: "#f472b6",
    gradient: ["#f472b6", "#fb7185"],
    category: "media",
    status: "coming-soon",
    tags: ["video", "transcribe", "frames"],
    labels: { tier: "capability", domain: "media" },
    version: "0.1.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  commands: [],
  tools: [
    {
      id: "transcribe_video",
      name: "Transcribe Video",
      description: "Extract audio transcript from video file.",
    },
    {
      id: "describe_frames",
      name: "Describe Frames",
      description: "Generate text descriptions of key video frames.",
    },
  ],

  docs: {
    documents: [
      { id: "video-readme", title: "Video to Text", type: "readme", content: "# Video to Text\n\nExtract transcripts and frame descriptions from video.", order: 1 },
    ],
    readme: "# Video to Text Kit\n\nVideo content extraction capability (coming soon).",
  },
};
