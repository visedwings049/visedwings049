const LOOP_SUFFIX =
  "Seamless continuous loop with matching first and last frame, smooth ambient motion, cinematic lighting, no on-screen text, no logos or watermarks, background visual for a church sermon screen.";

export function buildDefaultPrompt(phrase: string, context: string, style: string): string {
  const styleClause = style.trim() ? `${style.trim()}. ` : "";
  const contextClause = context.trim() ? ` Context from the sermon: "${context.trim()}".` : "";
  return `${styleClause}An evocative visual representing "${phrase}".${contextClause} ${LOOP_SUFFIX}`;
}

export const DEFAULT_MODEL = "seedance_2_5";
export const DEFAULT_DURATION = 6;
export const DEFAULT_ASPECT_RATIO = "16:9";
