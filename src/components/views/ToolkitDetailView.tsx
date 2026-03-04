import { useState } from "react";
import type { Agent, ToolkitId, ViewId, NavContext } from "@/types";
import { TOOLKITS } from "@/constants";
import {
  Globe, ScanText, AudioLines, Video,
  ExternalLink, Play, Link2, Search, Camera,
  Layers, Clock, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import "../../styles/components/toolkit-detail.css";

/** Map toolkit icon names to actual Lucide components */
const ICON_MAP: Record<string, any> = {
  Globe, ScanText, AudioLines, Video,
};

interface ToolkitDetailViewProps {
  toolkitId: ToolkitId;
  agent: Agent;
  updateAgent?: (id: string, patch: Partial<Agent>) => void;
  navigateTo: (view: ViewId, ctx: NavContext) => void;
}

/** Map tool IDs to icons */
const TOOL_ICONS: Record<string, any> = {
  fetch_url: ExternalLink,
  crawl_site: Search,
  extract_links: Link2,
  screenshot_url: Camera,
  ocr_image: ScanText,
  ocr_pdf: ScanText,
  transcribe_audio: AudioLines,
  transcribe_video: Video,
  describe_frames: Layers,
};

export function ToolkitDetailView({ toolkitId, agent, updateAgent, navigateTo }: ToolkitDetailViewProps) {
  const toolkit = TOOLKITS.find(t => t.id === toolkitId);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlDepth, setCrawlDepth] = useState(2);
  const [crawlMaxPages, setCrawlMaxPages] = useState(10);
  const [crawlFormat, setCrawlFormat] = useState<"markdown" | "text" | "html">("markdown");

  if (!toolkit) {
    return (
      <div className="toolkit-detail__empty">
        Toolkit not found.
      </div>
    );
  }

  const isEnabled = agent.toolkits?.some(t => t.toolkitId === toolkitId) ?? false;
  const binding = agent.toolkits?.find(t => t.toolkitId === toolkitId);
  const IconComponent = ICON_MAP[toolkit.icon] || Globe;
  const isComingSoon = toolkit.status === "coming-soon";

  const handleToggleToolkit = () => {
    if (!updateAgent) return;
    if (isEnabled) {
      // Remove toolkit
      updateAgent(agent.id, {
        toolkits: (agent.toolkits || []).filter(t => t.toolkitId !== toolkitId),
      });
    } else {
      // Enable toolkit
      updateAgent(agent.id, {
        toolkits: [...(agent.toolkits || []), {
          toolkitId,
          enabledAt: new Date().toISOString(),
          config: {},
        }],
      });
    }
  };

  return (
    <div className="toolkit-detail">
      {/* Header */}
      <div className="toolkit-detail__header">
        <div className="toolkit-detail__header-left">
          <div className="toolkit-detail__icon" style={{ background: `${toolkit.color}15`, border: `1px solid ${toolkit.color}25` }}>
            <GradientIcon icon={IconComponent} size={28} gradient={toolkit.gradient} />
          </div>
          <div>
            <h2 className="toolkit-detail__title">{toolkit.name}</h2>
            <p className="toolkit-detail__desc">{toolkit.description}</p>
            <div className="toolkit-detail__meta">
              <span className="toolkit-detail__category">
                {toolkit.category.replace("-", " ")}
              </span>
              <span className={`toolkit-detail__status toolkit-detail__status--${toolkit.status}`}>
                {toolkit.status === "available" ? (
                  <><CheckCircle2 size={10} /> Available</>
                ) : (
                  <><Clock size={10} /> Coming Soon</>
                )}
              </span>
              <span className="toolkit-detail__tool-count">
                <Layers size={10} /> {toolkit.tools.length} tools
              </span>
            </div>
          </div>
        </div>
        {!isComingSoon && (
          <button
            className={`toolkit-detail__toggle ${isEnabled ? "toolkit-detail__toggle--active" : ""}`}
            onClick={handleToggleToolkit}
          >
            {isEnabled ? "Enabled" : "Enable"}
          </button>
        )}
      </div>

      {/* Enabled status */}
      {isEnabled && binding && (
        <div className="toolkit-detail__enabled-bar" style={{ borderColor: `${toolkit.color}30` }}>
          <CheckCircle2 size={12} style={{ color: toolkit.color }} />
          <span>Enabled for <strong>{agent.name}</strong></span>
          <span className="toolkit-detail__enabled-date">
            since {new Date(binding.enabledAt).toLocaleDateString()}
          </span>
        </div>
      )}

      {/* Tools List */}
      <div className="toolkit-detail__section">
        <div className="toolkit-detail__section-title">
          Tools ({toolkit.tools.length})
        </div>
        <div className="toolkit-detail__tools">
          {toolkit.tools.map((tool) => {
            const ToolIcon = TOOL_ICONS[tool.id] || Globe;
            const isExpanded = expandedTool === tool.id;
            return (
              <div
                key={tool.id}
                className={`toolkit-detail__tool ${isExpanded ? "toolkit-detail__tool--expanded" : ""}`}
              >
                <button
                  className="toolkit-detail__tool-header"
                  onClick={() => setExpandedTool(isExpanded ? null : tool.id)}
                >
                  <div className="toolkit-detail__tool-info">
                    <span className="toolkit-detail__tool-icon" style={{ color: toolkit.color }}>
                      <ToolIcon size={14} />
                    </span>
                    <div>
                      <div className="toolkit-detail__tool-name">{tool.name}</div>
                      <div className="toolkit-detail__tool-desc">{tool.description}</div>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {isExpanded && tool.inputSchema && (
                  <div className="toolkit-detail__tool-schema">
                    <div className="toolkit-detail__schema-title">Parameters</div>
                    {Object.entries(tool.inputSchema).map(([key, schema]: [string, any]) => (
                      <div key={key} className="toolkit-detail__schema-row">
                        <code className="toolkit-detail__schema-key">{key}</code>
                        <span className="toolkit-detail__schema-type">{schema.type || "string"}</span>
                        <span className="toolkit-detail__schema-desc">{schema.description}</span>
                        {schema.required && <span className="toolkit-detail__schema-required">required</span>}
                        {schema.default !== undefined && (
                          <span className="toolkit-detail__schema-default">default: {String(schema.default)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Web Crawler Quick Actions */}
      {toolkitId === "web-crawler" && isEnabled && (
        <div className="toolkit-detail__section">
          <div className="toolkit-detail__section-title">
            Quick Actions
          </div>
          <div className="toolkit-detail__quick-actions">
            <div className="toolkit-detail__action-card">
              <div className="toolkit-detail__action-header">
                <GradientIcon icon={ExternalLink} size={16} gradient={toolkit.gradient} />
                <span>Fetch URL</span>
              </div>
              <div className="toolkit-detail__action-form">
                <input
                  className="toolkit-detail__input"
                  type="text"
                  placeholder="https://example.com"
                  value={crawlUrl}
                  onChange={e => setCrawlUrl(e.target.value)}
                />
                <div className="toolkit-detail__action-row">
                  <label className="toolkit-detail__label">Format</label>
                  <div className="toolkit-detail__pills">
                    {(["markdown", "text", "html"] as const).map(f => (
                      <button
                        key={f}
                        className={`toolkit-detail__pill ${crawlFormat === f ? "toolkit-detail__pill--active" : ""}`}
                        onClick={() => setCrawlFormat(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  className="toolkit-detail__run-btn"
                  disabled={!crawlUrl.trim()}
                  onClick={() => {
                    // TODO: Wire to job executor
                    alert(`Would fetch: ${crawlUrl} as ${crawlFormat}`);
                  }}
                >
                  <Play size={12} /> Fetch
                </button>
              </div>
            </div>

            <div className="toolkit-detail__action-card">
              <div className="toolkit-detail__action-header">
                <GradientIcon icon={Search} size={16} gradient={toolkit.gradient} />
                <span>Crawl Site</span>
              </div>
              <div className="toolkit-detail__action-form">
                <input
                  className="toolkit-detail__input"
                  type="text"
                  placeholder="https://example.com"
                  value={crawlUrl}
                  onChange={e => setCrawlUrl(e.target.value)}
                />
                <div className="toolkit-detail__action-row">
                  <label className="toolkit-detail__label">Max depth</label>
                  <input
                    className="toolkit-detail__input toolkit-detail__input--small"
                    type="number"
                    min={1}
                    max={5}
                    value={crawlDepth}
                    onChange={e => setCrawlDepth(Number(e.target.value))}
                  />
                </div>
                <div className="toolkit-detail__action-row">
                  <label className="toolkit-detail__label">Max pages</label>
                  <input
                    className="toolkit-detail__input toolkit-detail__input--small"
                    type="number"
                    min={1}
                    max={100}
                    value={crawlMaxPages}
                    onChange={e => setCrawlMaxPages(Number(e.target.value))}
                  />
                </div>
                <button
                  className="toolkit-detail__run-btn"
                  disabled={!crawlUrl.trim()}
                  onClick={() => {
                    // TODO: Wire to job executor
                    alert(`Would crawl: ${crawlUrl} depth=${crawlDepth} maxPages=${crawlMaxPages}`);
                  }}
                >
                  <Play size={12} /> Crawl
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Coming soon overlay */}
      {isComingSoon && (
        <div className="toolkit-detail__coming-soon">
          <AlertCircle size={20} style={{ color: toolkit.color }} />
          <div>
            <strong>{toolkit.name}</strong> is coming soon. This toolkit will be available in a future update.
          </div>
        </div>
      )}
    </div>
  );
}
