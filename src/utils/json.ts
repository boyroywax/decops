import type { MeshConfig } from "../types";

export function sanitizeJSONString(raw: string): string {
  let s = raw.replace(/```json|```/g, "").trim();
  const start = s.indexOf("{");
  if (start === -1) throw new Error("No JSON object found");
  s = s.slice(start);

  let result = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { result += c; esc = false; continue; }
    if (c === "\\") { result += c; esc = true; continue; }
    if (c === '"') { inStr = !inStr; result += c; continue; }
    if (inStr && (c === "\n" || c === "\r" || c === "\t")) { result += " "; continue; }
    result += c;
  }
  return result;
}

export function repairJSON(raw: string): MeshConfig {
  const s = sanitizeJSONString(raw);
  try { return JSON.parse(s) as MeshConfig; } catch { /* continue */ }

  const cutTargets = [
    /}\s*]\s*}\s*$/,
    /}\s*]\s*,?\s*$/,
    /}\s*,?\s*$/,
    /]\s*,?\s*$/,
  ];

  for (const pattern of cutTargets) {
    let best: string | null = null;
    for (let i = s.length; i > s.length / 2; i--) {
      const slice = s.slice(0, i);
      if (pattern.test(slice)) { best = slice; break; }
    }
    if (!best) continue;
    let attempt = best.replace(/,(\s*[}\]])/g, "$1");
    const opens = (attempt.match(/{/g) || []).length;
    const closes = (attempt.match(/}/g) || []).length;
    const openB = (attempt.match(/\[/g) || []).length;
    const closeB = (attempt.match(/]/g) || []).length;
    for (let j = 0; j < openB - closeB; j++) attempt += "]";
    for (let j = 0; j < opens - closes; j++) attempt += "}";
    try { return JSON.parse(attempt) as MeshConfig; } catch { /* continue */ }
  }

  // Nuclear option: extract each section independently with regex
  try {
    const agentsMatch = s.match(/"agents"\s*:\s*\[([\s\S]*?)\]/);
    const channelsMatch = s.match(/"channels"\s*:\s*\[([\s\S]*?)\]/);
    const groupsMatch = s.match(/"groups"\s*:\s*\[([\s\S]*?)\]/);
    const msgsMatch = s.match(/"exampleMessages"\s*:\s*\[([\s\S]*?)\]/);

    const parseArray = <T>(match: RegExpMatchArray | null): T[] => {
      if (!match) return [];
      let arrStr = "[" + match[1] + "]";
      arrStr = arrStr.replace(/,\s*]/g, "]");
      try { return JSON.parse(arrStr) as T[]; } catch {
        const lastClose = arrStr.lastIndexOf("}");
        if (lastClose > 0) {
          arrStr = arrStr.slice(0, lastClose + 1) + "]";
          try { return JSON.parse(arrStr) as T[]; } catch { return []; }
        }
        return [];
      }
    };

    const config: MeshConfig = {
      agents: parseArray(agentsMatch),
      channels: parseArray(channelsMatch),
      groups: parseArray(groupsMatch),
      exampleMessages: parseArray(msgsMatch),
    };
    if (config.agents.length > 0) return config;
  } catch { /* continue */ }

  throw new Error("Could not parse AI response — try a simpler description");
}
