/**
 * Audio to Text capability toolkit module (external integration).
 *
 * Facets: metadata, tools, docs
 */

import type { ToolkitModule } from "../types";

export const audioToTextModule: ToolkitModule = {
  manifest: {
    id: "audio-to-text",
    name: "Audio to Text",
    description:
      "Transcribe audio files and streams to text with speaker diarization.",
    icon: "AudioLines",
    color: "#fbbf24",
    gradient: ["#fbbf24", "#fb923c"],
    category: "media",
    status: "coming-soon",
    tags: ["audio", "transcribe", "speech"],
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
      id: "transcribe_audio",
      name: "Transcribe Audio",
      description: "Convert audio file to text transcription.",
    },
  ],

  docs: {
    documents: [
      { id: "audio-readme", title: "Audio to Text", type: "readme", content: "# Audio to Text\n\nTranscribe audio files and streams to text.", order: 1 },
    ],
    readme: "# Audio to Text Kit\n\nSpeech-to-text transcription capability (coming soon).",
  },
};
