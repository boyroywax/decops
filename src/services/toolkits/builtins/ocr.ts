/**
 * OCR capability toolkit module (external integration).
 *
 * Facets: metadata, tools, docs
 */

import type { ToolkitModule } from "../types";

export const ocrModule: ToolkitModule = {
  manifest: {
    id: "ocr",
    name: "OCR",
    description:
      "Optical Character Recognition — extract text from images, PDFs, and scanned documents.",
    icon: "ScanText",
    color: "#a78bfa",
    gradient: ["#a78bfa", "#c084fc"],
    category: "media",
    status: "coming-soon",
    tags: ["ocr", "text", "image", "pdf"],
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
      id: "ocr_image",
      name: "OCR Image",
      description: "Extract text from an image file.",
    },
    {
      id: "ocr_pdf",
      name: "OCR PDF",
      description: "Extract text from PDF pages.",
    },
  ],

  docs: {
    documents: [
      { id: "ocr-readme", title: "OCR", type: "readme", content: "# OCR\n\nExtract text from images, PDFs, and scanned documents.", order: 1 },
    ],
    readme: "# OCR Kit\n\nOptical Character Recognition capability (coming soon).",
  },
};
