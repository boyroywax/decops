export interface PromptEvalRule {
  id: string;
  pattern: RegExp | string;
  weight: number;
  required?: boolean;
}

export interface PromptEvalResult {
  score: number;
  maxScore: number;
  passedScore: number;
  passed: boolean;
  matchedRuleIds: string[];
  missingRuleIds: string[];
}

function matchesPattern(prompt: string, pattern: RegExp | string): boolean {
  if (typeof pattern === "string") return prompt.includes(pattern);
  return pattern.test(prompt);
}

export function evaluatePrompt(prompt: string, rules: PromptEvalRule[], passedScore = 0.85): PromptEvalResult {
  const maxScore = rules.reduce((sum, r) => sum + Math.max(0, r.weight), 0);

  let score = 0;
  const matchedRuleIds: string[] = [];
  const missingRuleIds: string[] = [];

  for (const rule of rules) {
    const matched = matchesPattern(prompt, rule.pattern);
    if (matched) {
      score += Math.max(0, rule.weight);
      matchedRuleIds.push(rule.id);
    } else {
      missingRuleIds.push(rule.id);
      if (rule.required) {
        // Required rules fail the score gate by force if missing.
        return {
          score,
          maxScore,
          passedScore,
          passed: false,
          matchedRuleIds,
          missingRuleIds,
        };
      }
    }
  }

  const normalized = maxScore > 0 ? score / maxScore : 0;
  return {
    score: normalized,
    maxScore,
    passedScore,
    passed: normalized >= passedScore,
    matchedRuleIds,
    missingRuleIds,
  };
}
