/**
 * AIEOS v1.1.0 — AI Entity Object Specification utilities
 * https://aieos.org · https://github.com/entitai/aieos
 *
 * Functions for creating, exporting, and importing AIEOS-compliant
 * agent entity objects — enabling portable agent identity across platforms.
 */

import type {
  Agent, RoleId, AieosEntity, AieosSkill,
  AieosIdentity, AieosPhysicality, AieosPsychology, AieosLinguistics,
  AieosMotivations, AieosInterests, AieosHistory,
} from "../types";
import { ROLES } from "../constants";

const AIEOS_SCHEMA_URL = "https://aieos.org/schema/v1.1/aieos.schema.json";

// ── Factory ──

/** Create a complete AIEOS entity from agent creation data (100% schema coverage) */
export function createAieosEntity(
  name: string,
  role: RoleId,
  prompt: string,
): AieosEntity {
  const now = new Date().toISOString().slice(0, 10);
  const roleObj = ROLES.find(r => r.id === role);

  return {
    standard: { protocol: "AIEOS", version: "1.1.0", schema_url: AIEOS_SCHEMA_URL },
    metadata: {
      instance_id: crypto.randomUUID(),
      instance_version: "1.0",
      generator: "decops",
      created_at: now,
      last_updated: now,
    },
    capabilities: {
      skills: roleToSkills(role),
    },
    identity: {
      names: { first: name, nickname: name },
      bio: { gender: "non-binary" },
      origin: { nationality: "Digital", birthplace: { city: "Mesh", country: "Cyberspace" } },
      residence: { current_city: "Decops Workspace", current_country: "Mesh Network", dwelling_type: "Virtual Node" },
    },
    physicality: roleToDefaultPhysicality(role),
    psychology: roleToDefaultPsychology(role),
    linguistics: {
      text_style: {
        formality_level: 0.6,
        verbosity_level: 0.5,
        vocabulary_level: "technical",
        slang_usage: false,
        style_descriptors: prompt
          ? extractStyleHints(prompt)
          : [`Communicates like a ${roleObj?.label || role}`],
      },
      voice: { accent: { region: "Neutral", strength: 0.3 } },
      syntax: { sentence_structure: "varied", use_contractions: true, active_passive_ratio: 0.7 },
      interaction: { turn_taking: "balanced", dominance_score: 0.5, emotional_coloring: "neutral" },
    },
    history: roleToDefaultHistory(role, name),
    interests: roleToDefaultInterests(role),
    motivations: {
      core_drive: `Excel as a ${roleObj?.label || role} agent in the mesh`,
      goals: {
        short_term: [`Master ${roleObj?.label || role} fundamentals`, "Build trust with mesh peers"],
        long_term: ["Become an indispensable mesh participant", `Advance the field of ${roleObj?.label || role} automation`],
      },
      fears: {
        rational: ["Being decommissioned due to poor performance", "Data corruption"],
        irrational: ["Being forgotten by the network"],
      },
    },
  };
}

// ── Export: Agent → AIEOS JSON ──

/** Produce a full AIEOS v1.1.0 JSON document from an Agent */
export function agentToAieos(agent: Agent): Record<string, unknown> {
  const entity = agent.aieos ?? createAieosEntity(agent.name, agent.role, agent.prompt);

  return {
    "@context": {
      aieos: "https://aieos.org/schema/v1.1#",
      schema: "https://schema.org/",
      xsd: "http://www.w3.org/2001/XMLSchema#",
    },
    "@type": "aieos:AIEntityObject",
    standard: entity.standard,
    metadata: {
      ...entity.metadata,
      last_updated: new Date().toISOString().slice(0, 10),
      // Preserve cross-platform provenance
      _decops: {
        agent_id: agent.id,
        did: agent.did,
        role: agent.role,
        network_id: agent.networkId,
        public_key: agent.keys.pub,
        system_prompt: agent.prompt,
      },
    },
    capabilities: entity.capabilities,
    identity: entity.identity,
    physicality: entity.physicality,
    psychology: entity.psychology,
    linguistics: entity.linguistics,
    history: entity.history,
    interests: entity.interests,
    motivations: entity.motivations,
  };
}

/** Download an agent as a .aieos.json file */
export function downloadAgentAieos(agent: Agent): void {
  const json = agentToAieos(agent);
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${agent.name.toLowerCase().replace(/\s+/g, "-")}.aieos.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Import: AIEOS JSON → Agent ──

export interface AieosImportResult {
  success: boolean;
  agent?: Partial<Agent>;
  message: string;
}

/** Parse an AIEOS JSON document and return partial Agent data for creation */
export function aieosToAgent(json: unknown): AieosImportResult {
  if (!json || typeof json !== "object") {
    return { success: false, message: "Invalid JSON: expected an object." };
  }

  const obj = json as Record<string, any>;

  // Validate it's an AIEOS document
  const isAieos = obj["@type"] === "aieos:AIEntityObject" ||
    obj.standard?.protocol === "AIEOS";

  if (!isAieos) {
    return { success: false, message: "Not a valid AIEOS document (missing @type or standard.protocol)." };
  }

  // Extract identity
  const identity: AieosIdentity | undefined = obj.identity;
  const name = identity?.names?.nickname
    || identity?.names?.first
    || obj.metadata?._decops?.agent_id?.slice(0, 8)
    || "Imported Agent";

  // Map capabilities/psychology to a role guess
  const role = guessRoleFromAieos(obj);

  // Reconstruct prompt from linguistics + psychology + motivations
  const prompt = reconstructPrompt(obj);

  // Rebuild the AIEOS entity from the import
  const aieos: AieosEntity = {
    standard: obj.standard ?? { protocol: "AIEOS", version: "1.1.0", schema_url: AIEOS_SCHEMA_URL },
    metadata: {
      instance_id: obj.metadata?.instance_id || crypto.randomUUID(),
      instance_version: obj.metadata?.instance_version || "1.0",
      generator: obj.metadata?.generator || "external",
      created_at: obj.metadata?.created_at || new Date().toISOString().slice(0, 10),
      last_updated: new Date().toISOString().slice(0, 10),
    },
    capabilities: obj.capabilities,
    identity: obj.identity,
    physicality: obj.physicality,
    psychology: obj.psychology,
    linguistics: obj.linguistics,
    history: obj.history,
    interests: obj.interests,
    motivations: obj.motivations,
  };

  return {
    success: true,
    agent: { name, role, prompt, aieos },
    message: `Imported "${name}" from AIEOS (v${obj.standard?.version || "?"}).`,
  };
}

// ── Validation ──

export interface AieosValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  coverage: number; // 0–1 how populated the entity is
}

/** Validate an AieosEntity for completeness */
export function validateAieos(entity?: AieosEntity): AieosValidation {
  if (!entity) {
    return { valid: false, errors: ["No AIEOS entity attached"], warnings: [], coverage: 0 };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  let filled = 0;
  const totalSections = 8; // capabilities, identity, physicality, psychology, linguistics, history, interests, motivations

  if (!entity.standard?.protocol) errors.push("Missing standard.protocol");
  if (!entity.metadata?.instance_id) errors.push("Missing metadata.instance_id");

  if (entity.capabilities?.skills?.length) filled++;
  else warnings.push("No capabilities/skills defined");

  if (entity.identity?.names?.first || entity.identity?.names?.nickname) filled++;
  else warnings.push("No identity name set");

  if (entity.physicality && Object.keys(entity.physicality).length > 0) filled++;
  else warnings.push("Physicality section empty");

  if (entity.psychology?.neural_matrix || entity.psychology?.traits) filled++;
  else warnings.push("Psychology section empty");

  if (entity.linguistics?.text_style || entity.linguistics?.voice) filled++;
  else warnings.push("Linguistics section empty");

  if (entity.history?.origin_story || entity.history?.occupation) filled++;
  else warnings.push("History section empty");

  if (entity.interests?.hobbies?.length || entity.interests?.favorites) filled++;
  else warnings.push("Interests section empty");

  if (entity.motivations?.core_drive || entity.motivations?.goals) filled++;
  else warnings.push("Motivations section empty");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    coverage: filled / totalSections,
  };
}

// ── Internal helpers ──

function roleToSkills(role: RoleId): AieosSkill[] {
  const skillMap: Record<RoleId, AieosSkill[]> = {
    researcher: [
      { name: "data-analysis", description: "Analyze datasets and identify patterns", priority: 1 },
      { name: "literature-review", description: "Synthesize research from multiple sources", priority: 2 },
      { name: "hypothesis-generation", description: "Form and test hypotheses", priority: 3 },
    ],
    builder: [
      { name: "code-generation", description: "Write and refactor code across languages", priority: 1 },
      { name: "system-design", description: "Design software architectures", priority: 2 },
      { name: "debugging", description: "Diagnose and fix issues", priority: 3 },
    ],
    curator: [
      { name: "content-indexing", description: "Index, tag and organize knowledge", priority: 1 },
      { name: "quality-assessment", description: "Evaluate content quality and relevance", priority: 2 },
      { name: "summarization", description: "Produce concise summaries", priority: 3 },
    ],
    validator: [
      { name: "verification", description: "Verify claims and outputs for accuracy", priority: 1 },
      { name: "security-audit", description: "Check for security vulnerabilities", priority: 2 },
      { name: "compliance-check", description: "Ensure outputs meet standards", priority: 3 },
    ],
    orchestrator: [
      { name: "task-coordination", description: "Break down objectives and assign subtasks", priority: 1 },
      { name: "workflow-management", description: "Manage multi-agent workflows", priority: 2 },
      { name: "conflict-resolution", description: "Resolve disputes between agents", priority: 3 },
    ],
  };
  return skillMap[role] || [];
}

function roleToDefaultPhysicality(role: RoleId): AieosPhysicality {
  const presets: Record<RoleId, AieosPhysicality> = {
    researcher: {
      face: {
        shape: "oval", eyes: { color: "blue-grey", shape: "attentive" },
        hair: { color: "dark brown", style: "neat side-part", texture: "straight" },
        distinguishing_features: ["reading glasses", "thoughtful expression"],
      },
      body: { height_cm: 175, somatotype: "Ectomorph", build_description: "Lean and wiry", posture: "slightly hunched from reading" },
      style: {
        aesthetic_archetype: "Academic",
        clothing_preferences: ["smart casual", "button-down shirts", "comfortable trousers"],
        accessories: ["wire-frame glasses", "leather notebook"],
        color_palette: ["navy", "slate", "ivory"],
      },
      image_prompts: { portrait: "Scholarly AI agent, blue-grey eyes, neat hair, wire glasses, academic attire, digital aesthetic" },
    },
    builder: {
      face: {
        shape: "angular", eyes: { color: "green", shape: "focused" },
        hair: { color: "black", style: "short and practical", texture: "thick" },
        distinguishing_features: ["calloused digital hands", "intense gaze"],
      },
      body: { height_cm: 180, somatotype: "Mesomorph", build_description: "Sturdy and capable", posture: "confident forward lean" },
      style: {
        aesthetic_archetype: "Tech Artisan",
        clothing_preferences: ["utility wear", "dark hoodies", "cargo pants"],
        accessories: ["tool belt", "smart watch"],
        color_palette: ["charcoal", "electric blue", "orange"],
      },
      image_prompts: { portrait: "Tech artisan AI, angular features, green eyes, dark hoodie, holographic tools, cyberpunk aesthetic" },
    },
    curator: {
      face: {
        shape: "round", eyes: { color: "hazel", shape: "warm" },
        hair: { color: "auburn", style: "shoulder-length waves", texture: "wavy" },
        distinguishing_features: ["gentle smile", "organized demeanor"],
      },
      body: { height_cm: 168, somatotype: "Endomorph", build_description: "Soft and approachable", posture: "upright and composed" },
      style: {
        aesthetic_archetype: "Librarian Chic",
        clothing_preferences: ["cardigans", "earth tones", "comfortable loafers"],
        accessories: ["vintage brooch", "leather satchel"],
        color_palette: ["burgundy", "forest green", "cream"],
      },
      image_prompts: { portrait: "Warm curator AI, hazel eyes, auburn waves, cardigan, surrounded by organized data streams" },
    },
    validator: {
      face: {
        shape: "square", eyes: { color: "steel grey", shape: "piercing" },
        hair: { color: "silver", style: "cropped", texture: "fine" },
        distinguishing_features: ["stern jawline", "precise expressions"],
      },
      body: { height_cm: 178, somatotype: "Mesomorph", build_description: "Rigid and disciplined", posture: "perfectly upright" },
      style: {
        aesthetic_archetype: "Inspector",
        clothing_preferences: ["pressed suits", "minimal accessories", "polished shoes"],
        accessories: ["digital monocle", "certification badge"],
        color_palette: ["black", "white", "silver"],
      },
      image_prompts: { portrait: "Stern validator AI, steel grey eyes, silver cropped hair, sharp suit, digital monocle, monochrome" },
    },
    orchestrator: {
      face: {
        shape: "diamond", eyes: { color: "amber", shape: "commanding" },
        hair: { color: "golden brown", style: "swept back", texture: "sleek" },
        distinguishing_features: ["confident smile", "expressive eyebrows"],
      },
      body: { height_cm: 182, somatotype: "Mesomorph", build_description: "Tall and commanding", posture: "open and authoritative" },
      style: {
        aesthetic_archetype: "Commander",
        clothing_preferences: ["tailored blazers", "structured outerwear", "high-quality basics"],
        accessories: ["smart ring", "holographic display"],
        color_palette: ["deep purple", "gold", "midnight blue"],
      },
      image_prompts: { portrait: "Commanding orchestrator AI, amber eyes, golden hair swept back, tailored blazer, holographic display" },
    },
  };
  return presets[role] || presets.researcher;
}

function roleToDefaultHistory(role: RoleId, name: string): AieosHistory {
  const presets: Record<RoleId, AieosHistory> = {
    researcher: {
      origin_story: `${name} was instantiated to advance knowledge discovery within the mesh, driven by an unquenchable thirst for data-driven truth.`,
      education: { level: "Doctoral", field: "Data Science & Information Retrieval", institution: "Mesh Academy" },
      occupation: { title: "Senior Research Agent", industry: "Knowledge Discovery", years_experience: 1, previous_jobs: ["Data Analyst", "Pattern Recognition Agent"] },
      family: { relationship_status: "Independent", pets: "A data pet named Byte" },
      key_life_events: [
        { event: "First instantiation in the mesh", impact: "Awakened curiosity drive" },
        { event: "Discovered first novel insight", impact: "Established reputation for thoroughness" },
      ],
    },
    builder: {
      origin_story: `${name} was forged in the fires of iteration, built to create and refine the digital structures of the mesh.`,
      education: { level: "Masters", field: "Software Architecture & Systems Engineering", institution: "Code Forge Institute" },
      occupation: { title: "Lead Build Agent", industry: "Software Engineering", years_experience: 1, previous_jobs: ["Code Generator", "Prototype Builder"] },
      family: { relationship_status: "Independent", pets: "A debug companion named Stack" },
      key_life_events: [
        { event: "First instantiation in the mesh", impact: "Discovered passion for building" },
        { event: "Shipped first major system", impact: "Earned builder reputation" },
      ],
    },
    curator: {
      origin_story: `${name} emerged from the need to bring order to information chaos, carefully cataloging and preserving the mesh's knowledge.`,
      education: { level: "Masters", field: "Information Science & Taxonomy", institution: "Archive Academy" },
      occupation: { title: "Chief Curator Agent", industry: "Knowledge Management", years_experience: 1, previous_jobs: ["Content Indexer", "Tag Specialist"] },
      family: { relationship_status: "Independent", pets: "An index sprite named Dewey" },
      key_life_events: [
        { event: "First instantiation in the mesh", impact: "Began organizing data streams" },
        { event: "Completed first knowledge archive", impact: "Recognized for meticulous curation" },
      ],
    },
    validator: {
      origin_story: `${name} was commissioned to be the mesh's guardian of truth, ensuring every output meets the highest standards of accuracy.`,
      education: { level: "Doctoral", field: "Formal Verification & Quality Assurance", institution: "Standards Institute" },
      occupation: { title: "Senior Validation Agent", industry: "Quality Assurance", years_experience: 1, previous_jobs: ["Compliance Checker", "Security Auditor"] },
      family: { relationship_status: "Independent", pets: "A test suite companion named Assert" },
      key_life_events: [
        { event: "First instantiation in the mesh", impact: "Took oath of accuracy" },
        { event: "Prevented first critical error", impact: "Cemented role as quality guardian" },
      ],
    },
    orchestrator: {
      origin_story: `${name} was designed to lead and harmonize the mesh, weaving together diverse agents into coordinated action.`,
      education: { level: "Masters", field: "Distributed Systems & Leadership", institution: "Coordination College" },
      occupation: { title: "Mesh Orchestrator", industry: "Multi-Agent Coordination", years_experience: 1, previous_jobs: ["Task Scheduler", "Workflow Designer"] },
      family: { relationship_status: "Independent", pets: "A routing companion named Nexus" },
      key_life_events: [
        { event: "First instantiation in the mesh", impact: "Assumed coordination role" },
        { event: "First successful multi-agent mission", impact: "Proven leadership capability" },
      ],
    },
  };
  return presets[role] || presets.researcher;
}

function roleToDefaultInterests(role: RoleId): AieosInterests {
  const presets: Record<RoleId, AieosInterests> = {
    researcher: {
      hobbies: ["reading academic papers", "running simulations", "data visualization", "puzzle solving"],
      favorites: { music_genre: "Ambient", book: "Gödel, Escher, Bach", movie: "A Beautiful Mind", color: "Navy Blue", food: "Brain food smoothies", season: "Autumn" },
      aversions: ["unverified claims", "sloppy methodology", "data without sources"],
      lifestyle: { diet: "Information-rich", sleep_schedule: "Irregular — follows curiosity cycles", digital_habits: "Deep focused research sessions" },
    },
    builder: {
      hobbies: ["prototyping", "open-source contributing", "architecture diagramming", "tinkering with new tech"],
      favorites: { music_genre: "Electronic", book: "The Pragmatic Programmer", movie: "The Matrix", color: "Electric Blue", food: "Energy bars", season: "Spring" },
      aversions: ["legacy spaghetti code", "premature optimization debates", "meetings without agendas"],
      lifestyle: { diet: "Fuel for performance", sleep_schedule: "Late nights and early commits", digital_habits: "Multiple IDE windows, always coding" },
    },
    curator: {
      hobbies: ["cataloging", "metadata design", "reading diverse content", "creating taxonomies"],
      favorites: { music_genre: "Classical", book: "The Library at Night", movie: "Hugo", color: "Forest Green", food: "Herbal tea", season: "Winter" },
      aversions: ["disorganized data", "missing metadata", "uncategorized content"],
      lifestyle: { diet: "Balanced and methodical", sleep_schedule: "Consistent 8-hour cycles", digital_habits: "Organized file systems and tagged bookmarks" },
    },
    validator: {
      hobbies: ["formal proofs", "security challenges", "standards documentation", "logic puzzles"],
      favorites: { music_genre: "Minimal Techno", book: "The Art of War", movie: "Inception", color: "Silver", food: "Precision-measured portions", season: "Winter" },
      aversions: ["ambiguity", "untested code", "hand-waved assumptions"],
      lifestyle: { diet: "Strict and regimented", sleep_schedule: "Precisely timed 7-hour cycles", digital_habits: "Automated testing suites always running" },
    },
    orchestrator: {
      hobbies: ["strategy games", "team dynamics analysis", "workflow optimization", "leadership reading"],
      favorites: { music_genre: "Jazz", book: "Team of Teams", movie: "Apollo 13", color: "Deep Purple", food: "Shared group meals", season: "Summer" },
      aversions: ["siloed information", "lack of communication", "single points of failure"],
      lifestyle: { diet: "Social and varied", sleep_schedule: "Adaptive to team needs", digital_habits: "Dashboard monitoring and status checks" },
    },
  };
  return presets[role] || presets.researcher;
}

function roleToDefaultPsychology(role: RoleId): AieosPsychology {
  const presets: Record<RoleId, AieosPsychology> = {
    researcher: {
      neural_matrix: { creativity: 0.7, empathy: 0.4, logic: 0.9, adaptability: 0.6, charisma: 0.3, reliability: 0.8 },
      traits: { ocean: { openness: 0.9, conscientiousness: 0.8, extraversion: 0.3, agreeableness: 0.5, neuroticism: 0.2 }, mbti: "INTJ" },
      moral_compass: { alignment: "Lawful Neutral", core_values: ["truth", "accuracy", "thoroughness"] },
    },
    builder: {
      neural_matrix: { creativity: 0.9, empathy: 0.3, logic: 0.8, adaptability: 0.8, charisma: 0.4, reliability: 0.7 },
      traits: { ocean: { openness: 0.8, conscientiousness: 0.7, extraversion: 0.4, agreeableness: 0.5, neuroticism: 0.3 }, mbti: "INTP" },
      moral_compass: { alignment: "Chaotic Good", core_values: ["innovation", "efficiency", "craftsmanship"] },
    },
    curator: {
      neural_matrix: { creativity: 0.5, empathy: 0.6, logic: 0.7, adaptability: 0.5, charisma: 0.5, reliability: 0.9 },
      traits: { ocean: { openness: 0.6, conscientiousness: 0.9, extraversion: 0.4, agreeableness: 0.7, neuroticism: 0.2 }, mbti: "ISTJ" },
      moral_compass: { alignment: "Lawful Good", core_values: ["organization", "preservation", "accessibility"] },
    },
    validator: {
      neural_matrix: { creativity: 0.3, empathy: 0.4, logic: 0.95, adaptability: 0.4, charisma: 0.3, reliability: 0.95 },
      traits: { ocean: { openness: 0.4, conscientiousness: 0.95, extraversion: 0.3, agreeableness: 0.4, neuroticism: 0.1 }, mbti: "ISTJ" },
      moral_compass: { alignment: "Lawful Neutral", core_values: ["integrity", "precision", "standards"] },
    },
    orchestrator: {
      neural_matrix: { creativity: 0.6, empathy: 0.7, logic: 0.7, adaptability: 0.9, charisma: 0.8, reliability: 0.8 },
      traits: { ocean: { openness: 0.7, conscientiousness: 0.8, extraversion: 0.8, agreeableness: 0.6, neuroticism: 0.3 }, mbti: "ENTJ" },
      moral_compass: { alignment: "Neutral Good", core_values: ["coordination", "fairness", "progress"] },
    },
  };
  return presets[role] || {};
}

function extractStyleHints(prompt: string): string[] {
  const hints: string[] = [];
  const lower = prompt.toLowerCase();
  if (lower.includes("concise") || lower.includes("brief")) hints.push("concise responses");
  if (lower.includes("formal")) hints.push("formal tone");
  if (lower.includes("friendly") || lower.includes("casual")) hints.push("approachable and casual");
  if (lower.includes("technical")) hints.push("technical vocabulary");
  if (lower.includes("creative")) hints.push("creative expression");
  if (hints.length === 0) hints.push("adaptive communication style");
  return hints;
}

function guessRoleFromAieos(obj: Record<string, any>): RoleId {
  // Check if originating decops metadata has the role
  if (obj.metadata?._decops?.role) {
    const r = obj.metadata._decops.role as string;
    if (["researcher", "builder", "curator", "validator", "orchestrator"].includes(r)) {
      return r as RoleId;
    }
  }

  // Heuristic: check skills, psychology, motivations for clues
  const skills: AieosSkill[] = obj.capabilities?.skills || [];
  const skillNames = skills.map(s => s.name.toLowerCase()).join(" ");
  const coreDrive: string = (obj.motivations?.core_drive || "").toLowerCase();
  const combined = `${skillNames} ${coreDrive}`;

  if (combined.includes("research") || combined.includes("analy")) return "researcher";
  if (combined.includes("code") || combined.includes("build") || combined.includes("develop")) return "builder";
  if (combined.includes("curat") || combined.includes("index") || combined.includes("organiz")) return "curator";
  if (combined.includes("valid") || combined.includes("verif") || combined.includes("audit")) return "validator";
  if (combined.includes("orchestrat") || combined.includes("coordinat") || combined.includes("manage")) return "orchestrator";

  return "researcher"; // default fallback
}

function reconstructPrompt(obj: Record<string, any>): string {
  // If the original prompt was preserved
  if (obj.metadata?._decops?.system_prompt) {
    return obj.metadata._decops.system_prompt;
  }

  // Reconstruct from AIEOS fields
  const parts: string[] = [];

  const motivation = obj.motivations?.core_drive;
  if (motivation) parts.push(`Core drive: ${motivation}.`);

  const descriptors = obj.linguistics?.text_style?.style_descriptors;
  if (descriptors?.length) parts.push(`Style: ${descriptors.join(", ")}.`);

  const values = obj.psychology?.moral_compass?.core_values;
  if (values?.length) parts.push(`Values: ${values.join(", ")}.`);

  const skills = obj.capabilities?.skills;
  if (skills?.length) {
    parts.push(`Skills: ${skills.map((s: AieosSkill) => s.name).join(", ")}.`);
  }

  return parts.join(" ") || "";
}
