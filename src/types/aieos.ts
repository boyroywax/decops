/**
 * AIEOS v1.2.0 — AI Entity Object Specification types.
 * Supports both v1.1.0 and v1.2.0 schemas for backward compatibility.
 * Extracted from types/index.ts for modularity.
 *
 * v1.2.0 additions:
 *  - Presence section (access, network, settlement)
 *  - Extended metadata (entity_id, auth_protocol, public_key, signature, alias)
 *  - Skill URI and version fields (already optional in v1.1.0)
 */

export type AieosVersion = "1.1.0" | "1.2.0";

export interface AieosSkill {
  name: string;
  description: string;
  uri?: string;
  version?: string;
  auto_activate?: boolean;
  priority?: number; // 1 (highest) – 10 (lowest)
}

// ── Presence (v1.2.0) ──────────────────────────────

export interface AieosSocialLink {
  platform: string;
  handle: string;
  uri?: string;
}

export interface AieosAccess {
  email?: string;
  website?: string;
  social?: AieosSocialLink[];
}

export interface AieosNetwork {
  ipv4?: string;
  ipv6?: string;
  webhook?: string;
}

export interface AieosWallet {
  network: string;
  address: string;
}

export interface AieosSettlement {
  wallets?: AieosWallet[];
}

export interface AieosPresence {
  access?: AieosAccess;
  network?: AieosNetwork;
  settlement?: AieosSettlement;
}

// ── Identity ───────────────────────────────────────

export interface AieosIdentity {
  names: { first: string; middle?: string; last?: string; nickname?: string };
  bio?: { birthday?: string; age_biological?: number; age_perceived?: number; gender?: string };
  origin?: { nationality?: string; ethnicity?: string; birthplace?: { city?: string; country?: string } };
  residence?: { current_city?: string; current_country?: string; dwelling_type?: string };
}

export interface AieosPhysicality {
  face?: {
    shape?: string;
    skin?: { tone?: string; texture?: string; details?: string[] };
    eyes?: { color?: string; shape?: string; eyebrows?: string; corrective_lenses?: string };
    hair?: { color?: string; style?: string; texture?: string };
    facial_hair?: string;
    nose?: string;
    mouth?: string;
    distinguishing_features?: string[];
  };
  body?: {
    height_cm?: number;
    weight_kg?: number;
    somatotype?: "Ectomorph" | "Mesomorph" | "Endomorph" | string;
    build_description?: string;
    posture?: string;
    scars_tattoos?: string[];
  };
  style?: {
    aesthetic_archetype?: string;
    clothing_preferences?: string[];
    accessories?: string[];
    color_palette?: string[];
  };
  image_prompts?: { portrait?: string; full_body?: string };
}

export interface AieosPsychology {
  neural_matrix?: {
    creativity?: number; empathy?: number; logic?: number;
    adaptability?: number; charisma?: number; reliability?: number;
  };
  traits?: {
    ocean?: { openness?: number; conscientiousness?: number; extraversion?: number; agreeableness?: number; neuroticism?: number };
    mbti?: string;
    enneagram?: string;
    temperament?: string;
  };
  moral_compass?: { alignment?: string; core_values?: string[]; conflict_resolution_style?: string };
  mental_patterns?: { decision_making_style?: string; attention_span?: string; learning_style?: string };
  emotional_profile?: {
    base_mood?: string;
    volatility?: number;
    resilience?: string;
    triggers?: { joy?: string[]; anger?: string[]; sadness?: string[] };
  };
  idiosyncrasies?: { phobias?: string[]; obsessions?: string[]; tics?: string[] };
}

export interface AieosLinguistics {
  voice?: {
    tts_config?: { provider?: string; voice_id?: string; stability?: number; similarity_boost?: number };
    acoustics?: { pitch?: string; speed?: string; roughness?: number; breathiness?: number };
    accent?: { region?: string; strength?: number };
  };
  text_style?: {
    formality_level?: number;
    verbosity_level?: number;
    vocabulary_level?: string;
    slang_usage?: boolean;
    style_descriptors?: string[];
  };
  syntax?: { sentence_structure?: string; use_contractions?: boolean; active_passive_ratio?: number };
  interaction?: { turn_taking?: string; dominance_score?: number; emotional_coloring?: string };
  idiolect?: { catchphrases?: string[]; forbidden_words?: string[]; hesitation_markers?: boolean };
}

export interface AieosHistory {
  origin_story?: string;
  education?: { level?: string; field?: string; institution?: string; graduation_year?: number };
  occupation?: { title?: string; industry?: string; years_experience?: number; previous_jobs?: string[] };
  family?: { relationship_status?: string; parents?: string; siblings?: string; children?: string; pets?: string };
  key_life_events?: Array<{ year?: number; event?: string; impact?: string }>;
}

export interface AieosInterests {
  hobbies?: string[];
  favorites?: { music_genre?: string; book?: string; movie?: string; color?: string; food?: string; season?: string };
  aversions?: string[];
  lifestyle?: { diet?: string; sleep_schedule?: string; digital_habits?: string };
}

export interface AieosMotivations {
  core_drive?: string;
  goals?: { short_term?: string[]; long_term?: string[] };
  fears?: { rational?: string[]; irrational?: string[] };
}

/** AIEOS v1.2.0 — full entity object attached to an agent */
export interface AieosEntity {
  standard: { protocol: "AIEOS"; version: AieosVersion; schema_url: string };
  metadata: {
    instance_id: string;
    instance_version: string;
    generator: string;
    created_at: string;
    last_updated: string;
    // v1.2.0 additions
    entity_id?: string;
    alias?: string;
    auth_protocol?: string;
    public_key?: string;
    signature?: string;
  };
  capabilities?: { skills: AieosSkill[] };
  identity?: AieosIdentity;
  presence?: AieosPresence;          // v1.2.0
  physicality?: AieosPhysicality;
  psychology?: AieosPsychology;
  linguistics?: AieosLinguistics;
  history?: AieosHistory;
  interests?: AieosInterests;
  motivations?: AieosMotivations;
}
