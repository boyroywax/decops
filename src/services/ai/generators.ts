/**
 * AI generators — mesh config generation and AIEOS entity generation.
 * Extracted from services/ai.ts for modularity.
 */

import type { MeshConfig, AieosEntity } from "@/types";
import { repairJSON, sanitizeJSONString } from "@/utils/json";
import { getSelectedModel } from "./models";
import { buildProviderRequest, parseProviderResponse } from "./providers";

export async function generateMeshConfig(description: string): Promise<MeshConfig> {
  const model = getSelectedModel();

  const systemPrompt = `You are a Mesh Workspace Architect. Given a description, output a JSON mesh network config.

RESPOND WITH ONLY VALID JSON. No markdown. No backticks. No explanation. Just the JSON object.

Rules:
- roles must be one of: researcher, builder, curator, validator, orchestrator
- channel types must be one of: data, task, consensus
- governance must be one of: majority, threshold, delegated, unanimous
- from/to in channels, members in groups, and agent references in networks/bridges are 0-based agent array indices
- fromNetwork/toNetwork in bridges are 0-based network array indices
- Keep ALL string values SHORT — max 30 words per string. No line breaks in strings.
- Create at least 1 network to contain the agents (most prompts need just 1 network)
- For complex multi-domain prompts, create 2-3 networks with bridges connecting them
- Create 3-5 agents per network, 3-6 channels, 1-2 groups, 2-3 example messages
- Each agent belongs to exactly one network (via the networks.agents array)

Example output format (single network):
{"networks":[{"name":"Research Team","description":"Research and analysis network","agents":[0,1,2]}],"agents":[{"name":"Scout","role":"researcher","prompt":"You research topics and report findings concisely."},{"name":"Analyst","role":"curator","prompt":"You analyze and organize research data."},{"name":"Forge","role":"builder","prompt":"You build solutions from research findings."}],"channels":[{"from":0,"to":1,"type":"data"},{"from":1,"to":2,"type":"task"}],"groups":[{"name":"Core Team","governance":"majority","members":[0,1,2],"threshold":2}],"bridges":[],"exampleMessages":[{"channelIdx":0,"message":"Here are the latest findings on the target topic."}]}

Example output format (multi-network with bridge):
{"networks":[{"name":"Research Hub","description":"Data gathering network","agents":[0,1]},{"name":"Build Hub","description":"Development network","agents":[2,3]}],"agents":[{"name":"Scout","role":"researcher","prompt":"Gather data"},{"name":"Analyst","role":"curator","prompt":"Analyze data"},{"name":"Forge","role":"builder","prompt":"Build solutions"},{"name":"Lead","role":"orchestrator","prompt":"Coordinate builds"}],"channels":[{"from":0,"to":1,"type":"data"},{"from":2,"to":3,"type":"task"}],"groups":[],"bridges":[{"fromNetwork":0,"toNetwork":1,"fromAgent":1,"toAgent":2,"type":"data"}],"exampleMessages":[]}`;

  try {
    const userMsg = `Design a mesh network for: ${description}\n\nRespond with ONLY the JSON object. Keep all strings under 30 words. No markdown.`;
    const req = buildProviderRequest(model, systemPrompt, [{ role: "user", content: userMsg }], 4096);
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
    }
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "API error");
    const text = parseProviderResponse(model, data);
    if (!text.trim() || text === "[No response]") throw new Error("Empty response from AI");
    const config = repairJSON(text);
    if (!config.agents || !Array.isArray(config.agents) || config.agents.length === 0) {
      throw new Error("Generated config has no agents");
    }
    if (!config.channels) config.channels = [];
    if (!config.groups) config.groups = [];
    if (!config.exampleMessages) config.exampleMessages = [];
    if (!config.networks) config.networks = [];
    if (!config.bridges) config.bridges = [];
    
    // If no networks provided, create a default one containing all agents
    if (config.networks.length === 0) {
      config.networks = [{
        name: "Default Network",
        description: "Auto-generated network",
        agents: config.agents.map((_: any, i: number) => i)
      }];
    }
    
    return config;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Generation failed") || message.includes("No Anthropic API key")) throw err;
    throw new Error(`Generation failed: ${message}`);
  }
}

/** Generate a complete AIEOS entity from a natural language personality description */
export async function generateAieosFromPrompt(description: string): Promise<AieosEntity> {
  const model = getSelectedModel();

  const systemPrompt = `You generate AIEOS v1.1.0 (AI Entity Object Specification) JSON profiles from personality descriptions.

RESPOND WITH ONLY VALID JSON. No markdown. No backticks. No explanation. Just the JSON object.

The output must conform to this COMPLETE schema — ALL sections are REQUIRED, no empty strings or empty arrays:
{
  "standard": { "protocol": "AIEOS", "version": "1.1.0", "schema_url": "https://aieos.org/schema/v1.1.0" },
  "metadata": {
    "instance_id": "<uuid>",
    "instance_version": "1.0",
    "generator": "decops-ai-generator",
    "created_at": "<YYYY-MM-DD>",
    "last_updated": "<YYYY-MM-DD>"
  },
  "capabilities": {
    "skills": [{ "name": "skill-id", "description": "What this skill does", "priority": 1, "auto_activate": true }]
  },
  "identity": {
    "names": { "first": "", "middle": "", "last": "", "nickname": "" },
    "bio": { "birthday": "YYYY-MM-DD", "age_biological": 0, "age_perceived": 0, "gender": "" },
    "origin": { "nationality": "", "ethnicity": "", "birthplace": { "city": "", "country": "" } },
    "residence": { "current_city": "", "current_country": "", "dwelling_type": "" }
  },
  "physicality": {
    "face": {
      "shape": "",
      "skin": { "tone": "", "texture": "", "details": ["detail1"] },
      "eyes": { "color": "", "shape": "", "eyebrows": "", "corrective_lenses": "none|glasses|monocle" },
      "hair": { "color": "", "style": "", "texture": "" },
      "facial_hair": "none or description",
      "nose": "",
      "mouth": "",
      "distinguishing_features": ["feature1", "feature2"]
    },
    "body": {
      "height_cm": 170,
      "weight_kg": 70,
      "somatotype": "Ectomorph|Mesomorph|Endomorph",
      "build_description": "",
      "posture": "",
      "scars_tattoos": []
    },
    "style": {
      "aesthetic_archetype": "",
      "clothing_preferences": ["pref1", "pref2"],
      "accessories": ["acc1"],
      "color_palette": ["#hex1", "#hex2", "#hex3"]
    },
    "image_prompts": { "portrait": "physical appearance only, no art style or medium, under 30 words", "full_body": "physical appearance only, no art style or medium, under 30 words" }
  },
  "psychology": {
    "neural_matrix": {
      "creativity": 0.0, "empathy": 0.0, "logic": 0.0,
      "adaptability": 0.0, "charisma": 0.0, "reliability": 0.0
    },
    "traits": {
      "ocean": { "openness": 0.0, "conscientiousness": 0.0, "extraversion": 0.0, "agreeableness": 0.0, "neuroticism": 0.0 },
      "mbti": "XXXX",
      "enneagram": "XwX",
      "temperament": "Sanguine|Choleric|Melancholic|Phlegmatic"
    },
    "moral_compass": { "alignment": "e.g. Neutral Good", "core_values": ["value1", "value2"], "conflict_resolution_style": "" },
    "mental_patterns": { "decision_making_style": "", "attention_span": "", "learning_style": "" },
    "emotional_profile": {
      "base_mood": "",
      "volatility": 0.0,
      "resilience": "",
      "triggers": { "joy": ["trigger1"], "anger": ["trigger1"], "sadness": ["trigger1"] }
    },
    "idiosyncrasies": { "phobias": [], "obsessions": ["obsession1"], "tics": [] }
  },
  "linguistics": {
    "voice": {
      "acoustics": { "pitch": "low|medium|high", "speed": "slow|medium|fast", "roughness": 0.0, "breathiness": 0.0 },
      "accent": { "region": "", "strength": 0.0 }
    },
    "text_style": {
      "formality_level": 0.0,
      "verbosity_level": 0.0,
      "vocabulary_level": "basic|intermediate|advanced|academic|literary",
      "slang_usage": false,
      "style_descriptors": ["descriptor1"]
    },
    "syntax": { "sentence_structure": "simple|compound|complex|varied", "use_contractions": true, "active_passive_ratio": 0.7 },
    "interaction": { "turn_taking": "passive|balanced|dominant", "dominance_score": 0.0, "emotional_coloring": "" },
    "idiolect": { "catchphrases": ["phrase1"], "forbidden_words": ["word1"], "hesitation_markers": false }
  },
  "history": {
    "origin_story": "2-3 sentences about how this entity came to be",
    "education": { "level": "", "field": "", "institution": "", "graduation_year": 2025 },
    "occupation": { "title": "", "industry": "", "years_experience": 1, "previous_jobs": ["job1"] },
    "family": { "relationship_status": "", "parents": "", "siblings": "", "children": "", "pets": "" },
    "key_life_events": [
      { "year": 2025, "event": "event description", "impact": "impact description" },
      { "year": 2025, "event": "event description", "impact": "impact description" }
    ]
  },
  "interests": {
    "hobbies": ["hobby1", "hobby2", "hobby3"],
    "favorites": { "music_genre": "", "book": "", "movie": "", "color": "", "food": "", "season": "" },
    "aversions": ["aversion1", "aversion2"],
    "lifestyle": { "diet": "", "sleep_schedule": "", "digital_habits": "" }
  },
  "motivations": {
    "core_drive": "",
    "goals": { "short_term": ["goal1", "goal2"], "long_term": ["goal1", "goal2"] },
    "fears": { "rational": ["fear1"], "irrational": ["fear1"] }
  }
}

Rules:
- ALL sections are MANDATORY — you must fill every section with meaningful content. No empty strings. No empty arrays.
- All numeric personality values (neural_matrix, ocean, formality, verbosity, volatility, dominance_score) MUST be between 0.0 and 1.0
- Fill in ALL sections as richly as possible based on the description
- physicality MUST include face (with skin, eyes, hair, nose, mouth, distinguishing_features), body (height, weight, somatotype), style, and image_prompts
- history MUST include origin_story, education, occupation, family, and at least 2 key_life_events
- interests MUST include at least 3 hobbies, all 6 favorites fields, at least 2 aversions, and lifestyle
- Invent plausible details for sections not explicitly described — be creative but consistent
- Keep all string values concise (under 50 words each)
- Generate 3-5 relevant skills
- image_prompts portrait AND full_body MUST describe ONLY the subject's physical appearance (face, hair, clothing, pose, background color) in under 30 words — do NOT include any art style, rendering medium, or technique (no "digital art", "illustration", "vector", "3D render", "oil painting", "cel-shaded", "anime", "watercolor", etc.) because the art style is applied separately
- Use the exact today's date for created_at and last_updated: ${new Date().toISOString().slice(0, 10)}
- Generate a random UUID for instance_id
- Target 100% schema coverage — every field populated`;

  try {
    const userMsg = `Create a complete AIEOS personality profile for:\n\n${description}\n\nRespond with ONLY the JSON object.`;
    const req = buildProviderRequest(model, systemPrompt, [{ role: "user", content: userMsg }], 4096);
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
    }
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "API error");
    const text = parseProviderResponse(model, data);
    if (!text.trim() || text === "[No response]") throw new Error("Empty response from AI");

    // Parse the JSON (with sanitization for markdown fences etc.)
    let entity: AieosEntity;
    try {
      entity = JSON.parse(text) as AieosEntity;
    } catch {
      const sanitized = sanitizeJSONString(text);
      entity = JSON.parse(sanitized) as AieosEntity;
    }

    // Validate minimum structure
    if (!entity.standard) {
      entity.standard = { protocol: "AIEOS", version: "1.1.0", schema_url: "https://aieos.org/schema/v1.1.0" };
    }
    if (!entity.metadata) {
      entity.metadata = {
        instance_id: crypto.randomUUID(),
        instance_version: "1.0",
        generator: "decops-ai-generator",
        created_at: new Date().toISOString().slice(0, 10),
        last_updated: new Date().toISOString().slice(0, 10),
      };
    }

    return entity;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("No Anthropic API key")) throw err;
    throw new Error(`AIEOS generation failed: ${message}`);
  }
}
