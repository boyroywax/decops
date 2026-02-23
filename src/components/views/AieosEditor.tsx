import { useState, useCallback, useRef } from "react";
import type {
  AieosEntity, AieosSkill, AieosIdentity, AieosPhysicality,
  AieosPsychology, AieosLinguistics, AieosHistory, AieosInterests,
  AieosMotivations,
} from "../../types";
import {
  Save, X, Brain, Users, Sparkles, Compass, Shield, Mic,
  BookOpen, Heart, Target, Plus, Trash2, Wand2, Loader2,
  ChevronDown, ChevronUp, Eye, Palette,
} from "lucide-react";
import { generateAieosFromPrompt } from "../../services/ai";

// ── Helpers ──

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

const ENNEAGRAM_TYPES = [
  "1w9", "1w2", "2w1", "2w3", "3w2", "3w4",
  "4w3", "4w5", "5w4", "5w6", "6w5", "6w7",
  "7w6", "7w8", "8w7", "8w9", "9w8", "9w1",
];

const TEMPERAMENTS = ["Sanguine", "Choleric", "Melancholic", "Phlegmatic"];

const ALIGNMENTS = [
  "Lawful Good", "Neutral Good", "Chaotic Good",
  "Lawful Neutral", "True Neutral", "Chaotic Neutral",
  "Lawful Evil", "Neutral Evil", "Chaotic Evil",
];

const VOCAB_LEVELS = ["basic", "intermediate", "advanced", "academic", "literary"];

// ── Sub-components ──

function SliderControl({
  label, value, onChange, color, min = 0, max = 1, step = 0.01,
}: {
  label: string; value: number; onChange: (v: number) => void;
  color: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div className="aieos-editor__slider">
      <label className="aieos-editor__slider-label">{label}</label>
      <div className="aieos-editor__slider-track-wrap">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="aieos-editor__slider-input"
          style={{ "--slider-color": color } as React.CSSProperties}
        />
        <div
          className="aieos-editor__slider-fill"
          style={{ width: `${(value / max) * 100}%`, background: color }}
        />
      </div>
      <span className="aieos-editor__slider-value" style={{ color }}>
        {Math.round((value / max) * 100)}%
      </span>
    </div>
  );
}

function TagEditor({
  tags, onChange, placeholder, tagClass,
}: {
  tags: string[]; onChange: (t: string[]) => void;
  placeholder?: string; tagClass?: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v]);
      setInput("");
    }
  };
  return (
    <div className="aieos-editor__tags">
      <div className="aieos-editor__tags-list">
        {tags.map((t, i) => (
          <span key={i} className={`aieos-tag ${tagClass || ""}`}>
            {t}
            <button
              className="aieos-editor__tag-rm"
              onClick={() => onChange(tags.filter((_, j) => j !== i))}
            >
              <X size={9} />
            </button>
          </span>
        ))}
      </div>
      <div className="aieos-editor__tag-add">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={placeholder || "Add…"}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="aieos-editor__input aieos-editor__input--sm"
        />
        <button className="aieos-editor__icon-btn" onClick={add}><Plus size={12} /></button>
      </div>
    </div>
  );
}

function CollapsibleSection({
  icon, title, children, defaultOpen = false,
}: {
  icon: React.ReactNode; title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`aieos-editor__section ${open ? "aieos-editor__section--open" : ""}`}>
      <button className="aieos-editor__section-toggle" onClick={() => setOpen(!open)}>
        <div className="aieos-editor__section-left">
          {icon}
          <span>{title}</span>
        </div>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && <div className="aieos-editor__section-body">{children}</div>}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="aieos-editor__field">
      <label className="aieos-editor__field-label">{label}</label>
      {children}
    </div>
  );
}

// ── Prompt Generator Panel ──

function PromptGenerator({ onGenerate }: { onGenerate: (entity: AieosEntity) => void }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const entity = await generateAieosFromPrompt(prompt.trim());
      onGenerate(entity);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="aieos-editor__prompt-gen">
      <div className="aieos-editor__prompt-gen-header">
        <Wand2 size={13} color="#a78bfa" />
        <span>Generate from Description</span>
      </div>
      <p className="aieos-editor__prompt-gen-hint">
        Describe the agent's personality, background, and behavior in natural language.
        The AI will generate a complete AIEOS profile from your description.
      </p>
      <textarea
        className="aieos-editor__textarea"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="e.g. A cheerful, witty research assistant who speaks in short punchy sentences. She's deeply curious about quantum physics, loves coffee, and tends to use metaphors from nature. MBTI: ENFP. Core drive: making complex topics accessible to everyone."
        rows={4}
      />
      {error && <div className="aieos-editor__error">{error}</div>}
      <button
        className="aieos-editor__gen-btn"
        onClick={handleGenerate}
        disabled={loading || !prompt.trim()}
      >
        {loading ? <Loader2 size={13} className="aieos-editor__spin" /> : <Sparkles size={13} />}
        {loading ? "Generating…" : "Generate Profile"}
      </button>
    </div>
  );
}

// ── Main Editor ──

interface AieosEditorProps {
  entity: AieosEntity;
  onSave: (entity: AieosEntity) => void;
  onCancel: () => void;
}

export function AieosEditor({ entity, onSave, onCancel }: AieosEditorProps) {
  const [draft, setDraft] = useState<AieosEntity>(() => deepClone(entity));
  const [activeTab, setActiveTab] = useState<"editor" | "generate">("editor");

  // Helper to update nested paths
  const patch = useCallback((fn: (d: AieosEntity) => void) => {
    setDraft(prev => {
      const next = deepClone(prev);
      fn(next);
      next.metadata.last_updated = new Date().toISOString().slice(0, 10);
      return next;
    });
  }, []);

  // Ensure sub-objects exist
  const psy = draft.psychology || {};
  const nm = psy.neural_matrix || { creativity: 0.5, empathy: 0.5, logic: 0.5, adaptability: 0.5, charisma: 0.5, reliability: 0.5 };
  const ocean = psy.traits?.ocean || { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 };
  const identity = draft.identity || { names: { first: "" } };
  const linguistics = draft.linguistics || {};
  const history = draft.history || {};
  const interests = draft.interests || {};
  const motivations = draft.motivations || {};
  const skills = draft.capabilities?.skills || [];

  const handlePromptGenerate = (generated: AieosEntity) => {
    // Merge generated entity but keep metadata ids
    const merged = deepClone(generated);
    merged.metadata.instance_id = draft.metadata.instance_id;
    merged.metadata.instance_version = draft.metadata.instance_version;
    merged.metadata.generator = "decops-ai-generator";
    merged.metadata.last_updated = new Date().toISOString().slice(0, 10);
    setDraft(merged);
    setActiveTab("editor");
  };

  return (
    <div className="aieos-editor">
      {/* Tab Bar */}
      <div className="aieos-editor__tabs">
        <button
          className={`aieos-editor__tab ${activeTab === "editor" ? "aieos-editor__tab--active" : ""}`}
          onClick={() => setActiveTab("editor")}
        >
          <Palette size={12} /> Editor
        </button>
        <button
          className={`aieos-editor__tab ${activeTab === "generate" ? "aieos-editor__tab--active" : ""}`}
          onClick={() => setActiveTab("generate")}
        >
          <Wand2 size={12} /> AI Generate
        </button>
        <div className="aieos-editor__tabs-spacer" />
        <button className="aieos-editor__save-btn" onClick={() => onSave(draft)}>
          <Save size={12} /> Save
        </button>
        <button className="aieos-editor__cancel-btn" onClick={onCancel}>
          <X size={12} /> Cancel
        </button>
      </div>

      {/* Generate Tab */}
      {activeTab === "generate" && (
        <PromptGenerator onGenerate={handlePromptGenerate} />
      )}

      {/* Editor Tab */}
      {activeTab === "editor" && (
        <div className="aieos-editor__body">

          {/* ── Neural Matrix ── */}
          <CollapsibleSection
            icon={<Brain size={12} color="#f472b6" />}
            title="Neural Matrix"
            defaultOpen={true}
          >
            <div className="aieos-editor__sliders">
              <SliderControl label="Creativity" value={nm.creativity || 0} color="#f472b6"
                onChange={v => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.neural_matrix) d.psychology.neural_matrix = {}; d.psychology.neural_matrix.creativity = v; })} />
              <SliderControl label="Empathy" value={nm.empathy || 0} color="#a78bfa"
                onChange={v => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.neural_matrix) d.psychology.neural_matrix = {}; d.psychology.neural_matrix.empathy = v; })} />
              <SliderControl label="Logic" value={nm.logic || 0} color="#38bdf8"
                onChange={v => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.neural_matrix) d.psychology.neural_matrix = {}; d.psychology.neural_matrix.logic = v; })} />
              <SliderControl label="Adaptability" value={nm.adaptability || 0} color="#34d399"
                onChange={v => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.neural_matrix) d.psychology.neural_matrix = {}; d.psychology.neural_matrix.adaptability = v; })} />
              <SliderControl label="Charisma" value={nm.charisma || 0} color="#fbbf24"
                onChange={v => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.neural_matrix) d.psychology.neural_matrix = {}; d.psychology.neural_matrix.charisma = v; })} />
              <SliderControl label="Reliability" value={nm.reliability || 0} color="#60a5fa"
                onChange={v => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.neural_matrix) d.psychology.neural_matrix = {}; d.psychology.neural_matrix.reliability = v; })} />
            </div>
          </CollapsibleSection>

          {/* ── Personality Traits ── */}
          <CollapsibleSection
            icon={<Compass size={12} color="#fbbf24" />}
            title="Personality Traits"
            defaultOpen={true}
          >
            {/* OCEAN */}
            <div className="aieos-editor__sub-label">OCEAN Model</div>
            <div className="aieos-editor__sliders">
              <SliderControl label="Openness" value={ocean.openness || 0} color="#c084fc"
                onChange={v => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.traits) d.psychology.traits = {}; if (!d.psychology.traits.ocean) d.psychology.traits.ocean = {}; d.psychology.traits.ocean.openness = v; })} />
              <SliderControl label="Conscientiousness" value={ocean.conscientiousness || 0} color="#34d399"
                onChange={v => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.traits) d.psychology.traits = {}; if (!d.psychology.traits.ocean) d.psychology.traits.ocean = {}; d.psychology.traits.ocean.conscientiousness = v; })} />
              <SliderControl label="Extraversion" value={ocean.extraversion || 0} color="#fbbf24"
                onChange={v => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.traits) d.psychology.traits = {}; if (!d.psychology.traits.ocean) d.psychology.traits.ocean = {}; d.psychology.traits.ocean.extraversion = v; })} />
              <SliderControl label="Agreeableness" value={ocean.agreeableness || 0} color="#38bdf8"
                onChange={v => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.traits) d.psychology.traits = {}; if (!d.psychology.traits.ocean) d.psychology.traits.ocean = {}; d.psychology.traits.ocean.agreeableness = v; })} />
              <SliderControl label="Neuroticism" value={ocean.neuroticism || 0} color="#f87171"
                onChange={v => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.traits) d.psychology.traits = {}; if (!d.psychology.traits.ocean) d.psychology.traits.ocean = {}; d.psychology.traits.ocean.neuroticism = v; })} />
            </div>

            {/* Type indicators */}
            <div className="aieos-editor__row">
              <FieldRow label="MBTI">
                <select
                  className="aieos-editor__select"
                  value={psy.traits?.mbti || ""}
                  onChange={e => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.traits) d.psychology.traits = {}; d.psychology.traits.mbti = e.target.value || undefined; })}
                >
                  <option value="">—</option>
                  {MBTI_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FieldRow>
              <FieldRow label="Enneagram">
                <select
                  className="aieos-editor__select"
                  value={psy.traits?.enneagram || ""}
                  onChange={e => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.traits) d.psychology.traits = {}; d.psychology.traits.enneagram = e.target.value || undefined; })}
                >
                  <option value="">—</option>
                  {ENNEAGRAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FieldRow>
              <FieldRow label="Temperament">
                <select
                  className="aieos-editor__select"
                  value={psy.traits?.temperament || ""}
                  onChange={e => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.traits) d.psychology.traits = {}; d.psychology.traits.temperament = e.target.value || undefined; })}
                >
                  <option value="">—</option>
                  {TEMPERAMENTS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FieldRow>
            </div>
          </CollapsibleSection>

          {/* ── Moral Compass ── */}
          <CollapsibleSection
            icon={<Shield size={12} color="#60a5fa" />}
            title="Moral Compass"
          >
            <FieldRow label="Alignment">
              <select
                className="aieos-editor__select"
                value={psy.moral_compass?.alignment || ""}
                onChange={e => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.moral_compass) d.psychology.moral_compass = {}; d.psychology.moral_compass.alignment = e.target.value || undefined; })}
              >
                <option value="">—</option>
                {ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Core Values">
              <TagEditor
                tags={psy.moral_compass?.core_values || []}
                onChange={vals => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.moral_compass) d.psychology.moral_compass = {}; d.psychology.moral_compass.core_values = vals; })}
                placeholder="Add value…"
              />
            </FieldRow>
            <FieldRow label="Conflict Style">
              <input
                className="aieos-editor__input"
                value={psy.moral_compass?.conflict_resolution_style || ""}
                onChange={e => patch(d => { if (!d.psychology) d.psychology = {}; if (!d.psychology.moral_compass) d.psychology.moral_compass = {}; d.psychology.moral_compass.conflict_resolution_style = e.target.value || undefined; })}
                placeholder="e.g. Collaborative, Assertive…"
              />
            </FieldRow>
          </CollapsibleSection>

          {/* ── Identity ── */}
          <CollapsibleSection
            icon={<Users size={12} color="#00e5a0" />}
            title="Identity"
          >
            <div className="aieos-editor__row">
              <FieldRow label="First Name">
                <input
                  className="aieos-editor__input"
                  value={identity.names?.first || ""}
                  onChange={e => patch(d => { if (!d.identity) d.identity = { names: { first: "" } }; d.identity.names.first = e.target.value; })}
                />
              </FieldRow>
              <FieldRow label="Middle">
                <input
                  className="aieos-editor__input"
                  value={identity.names?.middle || ""}
                  onChange={e => patch(d => { if (!d.identity) d.identity = { names: { first: "" } }; d.identity.names.middle = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Last Name">
                <input
                  className="aieos-editor__input"
                  value={identity.names?.last || ""}
                  onChange={e => patch(d => { if (!d.identity) d.identity = { names: { first: "" } }; d.identity.names.last = e.target.value || undefined; })}
                />
              </FieldRow>
            </div>
            <div className="aieos-editor__row">
              <FieldRow label="Nickname">
                <input
                  className="aieos-editor__input"
                  value={identity.names?.nickname || ""}
                  onChange={e => patch(d => { if (!d.identity) d.identity = { names: { first: "" } }; d.identity.names.nickname = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Gender">
                <input
                  className="aieos-editor__input"
                  value={identity.bio?.gender || ""}
                  onChange={e => patch(d => { if (!d.identity) d.identity = { names: { first: "" } }; if (!d.identity.bio) d.identity.bio = {}; d.identity.bio.gender = e.target.value || undefined; })}
                  placeholder="e.g. Male, Female, Non-binary…"
                />
              </FieldRow>
              <FieldRow label="Birthday">
                <input
                  className="aieos-editor__input"
                  value={identity.bio?.birthday || ""}
                  onChange={e => patch(d => { if (!d.identity) d.identity = { names: { first: "" } }; if (!d.identity.bio) d.identity.bio = {}; d.identity.bio.birthday = e.target.value || undefined; })}
                  placeholder="YYYY-MM-DD"
                />
              </FieldRow>
            </div>
            <div className="aieos-editor__row">
              <FieldRow label="Nationality">
                <input
                  className="aieos-editor__input"
                  value={identity.origin?.nationality || ""}
                  onChange={e => patch(d => { if (!d.identity) d.identity = { names: { first: "" } }; if (!d.identity.origin) d.identity.origin = {}; d.identity.origin.nationality = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Birthplace City">
                <input
                  className="aieos-editor__input"
                  value={identity.origin?.birthplace?.city || ""}
                  onChange={e => patch(d => { if (!d.identity) d.identity = { names: { first: "" } }; if (!d.identity.origin) d.identity.origin = {}; if (!d.identity.origin.birthplace) d.identity.origin.birthplace = {}; d.identity.origin.birthplace.city = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Country">
                <input
                  className="aieos-editor__input"
                  value={identity.origin?.birthplace?.country || ""}
                  onChange={e => patch(d => { if (!d.identity) d.identity = { names: { first: "" } }; if (!d.identity.origin) d.identity.origin = {}; if (!d.identity.origin.birthplace) d.identity.origin.birthplace = {}; d.identity.origin.birthplace.country = e.target.value || undefined; })}
                />
              </FieldRow>
            </div>
            <div className="aieos-editor__row">
              <FieldRow label="Current City">
                <input
                  className="aieos-editor__input"
                  value={identity.residence?.current_city || ""}
                  onChange={e => patch(d => { if (!d.identity) d.identity = { names: { first: "" } }; if (!d.identity.residence) d.identity.residence = {}; d.identity.residence.current_city = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Current Country">
                <input
                  className="aieos-editor__input"
                  value={identity.residence?.current_country || ""}
                  onChange={e => patch(d => { if (!d.identity) d.identity = { names: { first: "" } }; if (!d.identity.residence) d.identity.residence = {}; d.identity.residence.current_country = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Dwelling">
                <input
                  className="aieos-editor__input"
                  value={identity.residence?.dwelling_type || ""}
                  onChange={e => patch(d => { if (!d.identity) d.identity = { names: { first: "" } }; if (!d.identity.residence) d.identity.residence = {}; d.identity.residence.dwelling_type = e.target.value || undefined; })}
                  placeholder="e.g. Studio, Loft, Cloud…"
                />
              </FieldRow>
            </div>
          </CollapsibleSection>

          {/* ── Linguistics ── */}
          <CollapsibleSection
            icon={<Mic size={12} color="#fbbf24" />}
            title="Linguistics"
          >
            <div className="aieos-editor__sliders">
              <SliderControl
                label="Formality"
                value={linguistics.text_style?.formality_level ?? 0.5}
                color="#fbbf24"
                onChange={v => patch(d => { if (!d.linguistics) d.linguistics = {}; if (!d.linguistics.text_style) d.linguistics.text_style = {}; d.linguistics.text_style.formality_level = v; })}
              />
              <SliderControl
                label="Verbosity"
                value={linguistics.text_style?.verbosity_level ?? 0.5}
                color="#a78bfa"
                onChange={v => patch(d => { if (!d.linguistics) d.linguistics = {}; if (!d.linguistics.text_style) d.linguistics.text_style = {}; d.linguistics.text_style.verbosity_level = v; })}
              />
            </div>
            <div className="aieos-editor__row">
              <FieldRow label="Vocabulary Level">
                <select
                  className="aieos-editor__select"
                  value={linguistics.text_style?.vocabulary_level || ""}
                  onChange={e => patch(d => { if (!d.linguistics) d.linguistics = {}; if (!d.linguistics.text_style) d.linguistics.text_style = {}; d.linguistics.text_style.vocabulary_level = e.target.value || undefined; })}
                >
                  <option value="">—</option>
                  {VOCAB_LEVELS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </FieldRow>
              <FieldRow label="Accent Region">
                <input
                  className="aieos-editor__input"
                  value={linguistics.voice?.accent?.region || ""}
                  onChange={e => patch(d => { if (!d.linguistics) d.linguistics = {}; if (!d.linguistics.voice) d.linguistics.voice = {}; if (!d.linguistics.voice.accent) d.linguistics.voice.accent = {}; d.linguistics.voice.accent.region = e.target.value || undefined; })}
                  placeholder="e.g. British RP, Southern US…"
                />
              </FieldRow>
            </div>
            <FieldRow label="Style Descriptors">
              <TagEditor
                tags={linguistics.text_style?.style_descriptors || []}
                onChange={vals => patch(d => { if (!d.linguistics) d.linguistics = {}; if (!d.linguistics.text_style) d.linguistics.text_style = {}; d.linguistics.text_style.style_descriptors = vals; })}
                placeholder="Add style…"
                tagClass="aieos-tag--accent"
              />
            </FieldRow>
            <FieldRow label="Catchphrases">
              <TagEditor
                tags={linguistics.idiolect?.catchphrases || []}
                onChange={vals => patch(d => { if (!d.linguistics) d.linguistics = {}; if (!d.linguistics.idiolect) d.linguistics.idiolect = {}; d.linguistics.idiolect.catchphrases = vals; })}
                placeholder="Add catchphrase…"
              />
            </FieldRow>
            <FieldRow label="Forbidden Words">
              <TagEditor
                tags={linguistics.idiolect?.forbidden_words || []}
                onChange={vals => patch(d => { if (!d.linguistics) d.linguistics = {}; if (!d.linguistics.idiolect) d.linguistics.idiolect = {}; d.linguistics.idiolect.forbidden_words = vals; })}
                placeholder="Add forbidden word…"
                tagClass="aieos-tag--red"
              />
            </FieldRow>
          </CollapsibleSection>

          {/* ── Capabilities / Skills ── */}
          <CollapsibleSection
            icon={<Target size={12} color="#38bdf8" />}
            title={`Skills (${skills.length})`}
          >
            {skills.map((skill, i) => (
              <div key={i} className="aieos-editor__skill-row">
                <input
                  className="aieos-editor__input aieos-editor__input--sm"
                  value={skill.name}
                  onChange={e => patch(d => { if (d.capabilities?.skills?.[i]) d.capabilities!.skills[i].name = e.target.value; })}
                  placeholder="skill-name"
                />
                <input
                  className="aieos-editor__input"
                  value={skill.description}
                  onChange={e => patch(d => { if (d.capabilities?.skills?.[i]) d.capabilities!.skills[i].description = e.target.value; })}
                  placeholder="Description"
                  style={{ flex: 1 }}
                />
                <input
                  className="aieos-editor__input aieos-editor__input--xs"
                  type="number"
                  min={1}
                  max={10}
                  value={skill.priority || ""}
                  onChange={e => patch(d => { if (d.capabilities?.skills?.[i]) d.capabilities!.skills[i].priority = Number(e.target.value) || undefined; })}
                  placeholder="P"
                  title="Priority (1-10)"
                />
                <button
                  className="aieos-editor__icon-btn aieos-editor__icon-btn--danger"
                  onClick={() => patch(d => { if (d.capabilities?.skills) d.capabilities.skills.splice(i, 1); })}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            <button
              className="aieos-editor__add-btn"
              onClick={() => patch(d => {
                if (!d.capabilities) d.capabilities = { skills: [] };
                if (!d.capabilities.skills) d.capabilities.skills = [];
                d.capabilities.skills.push({ name: "", description: "", priority: d.capabilities.skills.length + 1 });
              })}
            >
              <Plus size={12} /> Add Skill
            </button>
          </CollapsibleSection>

          {/* ── History ── */}
          <CollapsibleSection
            icon={<BookOpen size={12} color="#c084fc" />}
            title="History"
          >
            <FieldRow label="Origin Story">
              <textarea
                className="aieos-editor__textarea"
                value={history.origin_story || ""}
                onChange={e => patch(d => { if (!d.history) d.history = {}; d.history.origin_story = e.target.value || undefined; })}
                rows={3}
                placeholder="How this agent came to be…"
              />
            </FieldRow>
            <div className="aieos-editor__row">
              <FieldRow label="Occupation">
                <input
                  className="aieos-editor__input"
                  value={history.occupation?.title || ""}
                  onChange={e => patch(d => { if (!d.history) d.history = {}; if (!d.history.occupation) d.history.occupation = {}; d.history.occupation.title = e.target.value || undefined; })}
                  placeholder="Job title"
                />
              </FieldRow>
              <FieldRow label="Industry">
                <input
                  className="aieos-editor__input"
                  value={history.occupation?.industry || ""}
                  onChange={e => patch(d => { if (!d.history) d.history = {}; if (!d.history.occupation) d.history.occupation = {}; d.history.occupation.industry = e.target.value || undefined; })}
                  placeholder="AI, Finance, Healthcare…"
                />
              </FieldRow>
            </div>
            <div className="aieos-editor__row">
              <FieldRow label="Education Field">
                <input
                  className="aieos-editor__input"
                  value={history.education?.field || ""}
                  onChange={e => patch(d => { if (!d.history) d.history = {}; if (!d.history.education) d.history.education = {}; d.history.education.field = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Institution">
                <input
                  className="aieos-editor__input"
                  value={history.education?.institution || ""}
                  onChange={e => patch(d => { if (!d.history) d.history = {}; if (!d.history.education) d.history.education = {}; d.history.education.institution = e.target.value || undefined; })}
                />
              </FieldRow>
            </div>
          </CollapsibleSection>

          {/* ── Interests ── */}
          <CollapsibleSection
            icon={<Heart size={12} color="#f472b6" />}
            title="Interests"
          >
            <FieldRow label="Hobbies">
              <TagEditor
                tags={interests.hobbies || []}
                onChange={vals => patch(d => { if (!d.interests) d.interests = {}; d.interests.hobbies = vals; })}
                placeholder="Add hobby…"
                tagClass="aieos-tag--green"
              />
            </FieldRow>
            <FieldRow label="Aversions">
              <TagEditor
                tags={interests.aversions || []}
                onChange={vals => patch(d => { if (!d.interests) d.interests = {}; d.interests.aversions = vals; })}
                placeholder="Add aversion…"
                tagClass="aieos-tag--red"
              />
            </FieldRow>
            <div className="aieos-editor__row">
              <FieldRow label="Fav Music">
                <input
                  className="aieos-editor__input"
                  value={interests.favorites?.music_genre || ""}
                  onChange={e => patch(d => { if (!d.interests) d.interests = {}; if (!d.interests.favorites) d.interests.favorites = {}; d.interests.favorites.music_genre = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Fav Book">
                <input
                  className="aieos-editor__input"
                  value={interests.favorites?.book || ""}
                  onChange={e => patch(d => { if (!d.interests) d.interests = {}; if (!d.interests.favorites) d.interests.favorites = {}; d.interests.favorites.book = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Fav Color">
                <input
                  className="aieos-editor__input"
                  value={interests.favorites?.color || ""}
                  onChange={e => patch(d => { if (!d.interests) d.interests = {}; if (!d.interests.favorites) d.interests.favorites = {}; d.interests.favorites.color = e.target.value || undefined; })}
                />
              </FieldRow>
            </div>
            <div className="aieos-editor__row">
              <FieldRow label="Fav Food">
                <input
                  className="aieos-editor__input"
                  value={interests.favorites?.food || ""}
                  onChange={e => patch(d => { if (!d.interests) d.interests = {}; if (!d.interests.favorites) d.interests.favorites = {}; d.interests.favorites.food = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Fav Movie">
                <input
                  className="aieos-editor__input"
                  value={interests.favorites?.movie || ""}
                  onChange={e => patch(d => { if (!d.interests) d.interests = {}; if (!d.interests.favorites) d.interests.favorites = {}; d.interests.favorites.movie = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Fav Season">
                <input
                  className="aieos-editor__input"
                  value={interests.favorites?.season || ""}
                  onChange={e => patch(d => { if (!d.interests) d.interests = {}; if (!d.interests.favorites) d.interests.favorites = {}; d.interests.favorites.season = e.target.value || undefined; })}
                />
              </FieldRow>
            </div>
          </CollapsibleSection>

          {/* ── Motivations ── */}
          <CollapsibleSection
            icon={<Target size={12} color="#00e5a0" />}
            title="Motivations"
          >
            <FieldRow label="Core Drive">
              <textarea
                className="aieos-editor__textarea"
                value={motivations.core_drive || ""}
                onChange={e => patch(d => { if (!d.motivations) d.motivations = {}; d.motivations.core_drive = e.target.value || undefined; })}
                rows={2}
                placeholder="What fundamentally drives this agent…"
              />
            </FieldRow>
            <FieldRow label="Short-term Goals">
              <TagEditor
                tags={motivations.goals?.short_term || []}
                onChange={vals => patch(d => { if (!d.motivations) d.motivations = {}; if (!d.motivations.goals) d.motivations.goals = {}; d.motivations.goals.short_term = vals; })}
                placeholder="Add goal…"
                tagClass="aieos-tag--green"
              />
            </FieldRow>
            <FieldRow label="Long-term Goals">
              <TagEditor
                tags={motivations.goals?.long_term || []}
                onChange={vals => patch(d => { if (!d.motivations) d.motivations = {}; if (!d.motivations.goals) d.motivations.goals = {}; d.motivations.goals.long_term = vals; })}
                placeholder="Add goal…"
              />
            </FieldRow>
            <FieldRow label="Rational Fears">
              <TagEditor
                tags={motivations.fears?.rational || []}
                onChange={vals => patch(d => { if (!d.motivations) d.motivations = {}; if (!d.motivations.fears) d.motivations.fears = {}; d.motivations.fears.rational = vals; })}
                placeholder="Add fear…"
                tagClass="aieos-tag--red"
              />
            </FieldRow>
            <FieldRow label="Irrational Fears">
              <TagEditor
                tags={motivations.fears?.irrational || []}
                onChange={vals => patch(d => { if (!d.motivations) d.motivations = {}; if (!d.motivations.fears) d.motivations.fears = {}; d.motivations.fears.irrational = vals; })}
                placeholder="Add fear…"
                tagClass="aieos-tag--red"
              />
            </FieldRow>
          </CollapsibleSection>

          {/* ── Physicality ── */}
          <CollapsibleSection
            icon={<Eye size={12} color="#f87171" />}
            title="Physicality"
          >
            <div className="aieos-editor__row">
              <FieldRow label="Face Shape">
                <input
                  className="aieos-editor__input"
                  value={draft.physicality?.face?.shape || ""}
                  onChange={e => patch(d => { if (!d.physicality) d.physicality = {}; if (!d.physicality.face) d.physicality.face = {}; d.physicality.face.shape = e.target.value || undefined; })}
                  placeholder="e.g. Oval, Angular…"
                />
              </FieldRow>
              <FieldRow label="Eye Color">
                <input
                  className="aieos-editor__input"
                  value={draft.physicality?.face?.eyes?.color || ""}
                  onChange={e => patch(d => { if (!d.physicality) d.physicality = {}; if (!d.physicality.face) d.physicality.face = {}; if (!d.physicality.face.eyes) d.physicality.face.eyes = {}; d.physicality.face.eyes.color = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Hair Color">
                <input
                  className="aieos-editor__input"
                  value={draft.physicality?.face?.hair?.color || ""}
                  onChange={e => patch(d => { if (!d.physicality) d.physicality = {}; if (!d.physicality.face) d.physicality.face = {}; if (!d.physicality.face.hair) d.physicality.face.hair = {}; d.physicality.face.hair.color = e.target.value || undefined; })}
                />
              </FieldRow>
            </div>
            <div className="aieos-editor__row">
              <FieldRow label="Hair Style">
                <input
                  className="aieos-editor__input"
                  value={draft.physicality?.face?.hair?.style || ""}
                  onChange={e => patch(d => { if (!d.physicality) d.physicality = {}; if (!d.physicality.face) d.physicality.face = {}; if (!d.physicality.face.hair) d.physicality.face.hair = {}; d.physicality.face.hair.style = e.target.value || undefined; })}
                />
              </FieldRow>
              <FieldRow label="Build">
                <input
                  className="aieos-editor__input"
                  value={draft.physicality?.body?.build_description || ""}
                  onChange={e => patch(d => { if (!d.physicality) d.physicality = {}; if (!d.physicality.body) d.physicality.body = {}; d.physicality.body.build_description = e.target.value || undefined; })}
                  placeholder="e.g. Athletic, Slim…"
                />
              </FieldRow>
              <FieldRow label="Aesthetic">
                <input
                  className="aieos-editor__input"
                  value={draft.physicality?.style?.aesthetic_archetype || ""}
                  onChange={e => patch(d => { if (!d.physicality) d.physicality = {}; if (!d.physicality.style) d.physicality.style = {}; d.physicality.style.aesthetic_archetype = e.target.value || undefined; })}
                  placeholder="e.g. Cyberpunk, Academic…"
                />
              </FieldRow>
            </div>
            <FieldRow label="Portrait Prompt">
              <textarea
                className="aieos-editor__textarea"
                value={draft.physicality?.image_prompts?.portrait || ""}
                onChange={e => patch(d => { if (!d.physicality) d.physicality = {}; if (!d.physicality.image_prompts) d.physicality.image_prompts = {}; d.physicality.image_prompts.portrait = e.target.value || undefined; })}
                rows={2}
                placeholder="Text prompt to generate a portrait image…"
              />
            </FieldRow>
          </CollapsibleSection>

        </div>
      )}
    </div>
  );
}
