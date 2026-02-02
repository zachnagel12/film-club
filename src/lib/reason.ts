// lib/reason.ts
type Breakdown = Record<string, number>;

/**
 * These weights mirror your RecScore v2 weights but intentionally
 * downweight ActingSim for explanation copy (per your product goal).
 */
const WEIGHTS = {
  FeelSim: 0.60,
  DirectionSim: 0.15,
  StyleSim: 0.10,
  DecadeFit: 0.07,
  ActingSim: 0.01, // de-emphasize acting in "reason" text
  Quality: 0.03,
  WorldSim: 0.05
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function labelFor(key: keyof typeof WEIGHTS): string {
  switch (key) {
    case "FeelSim":
      return "Matches the vibe & emotional intensity";
    case "DirectionSim":
      return "Similar directing / auteur signature";
    case "StyleSim":
      return "Similar pacing, rhythm, and style";
    case "WorldSim":
      return "Similar themes, genres, or motifs";
    case "DecadeFit":
      return "Similar era and storytelling conventions";
    case "Quality":
      return "Strong overall audience reception";
    case "ActingSim":
      return "Overlapping cast / performance style";
    default:
      return "Similar overall feel";
  }
}

/**
 * Pick 1 concise reason grounded in the model breakdown.
 * - Prefers Feel when it's high (users expect vibe alignment)
 * - Avoids Acting as headline reason unless it clearly dominates
 * - Avoids Quality as headline reason unless it's the only strong signal
 */
export function oneLineReason(b: Breakdown): string {
  const entries = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((k) => {
    const v = typeof b[k] === "number" ? b[k] : 0;
    return { key: k, weighted: WEIGHTS[k] * clamp01(v), raw: v };
  });

  entries.sort((a, c) => c.weighted - a.weighted);

  const top = entries[0];
  const second = entries[1];

  const feel = typeof b.FeelSim === "number" ? b.FeelSim : 0;
  if (feel >= 0.82) return labelFor("FeelSim");

  // Avoid “Quality” as the main reason if something else is close
  if (top.key === "Quality" && second && second.weighted > top.weighted * 0.85) {
    return labelFor(second.key);
  }

  // Avoid acting as main reason unless it’s clearly dominant
  if (top.key === "ActingSim" && second && second.weighted > top.weighted * 0.70) {
    return labelFor(second.key);
  }

  return labelFor(top.key);
}
