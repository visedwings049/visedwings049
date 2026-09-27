export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface MatchableKeyword {
  id: string;
  phrase: string;
  aliases: string[];
}

export interface Match {
  index: number;
  keywordId: string;
  matchedText: string;
}

/**
 * Builds a Vosk grammar (JSON array of words/phrases) restricted to this
 * sermon's keyword vocabulary, dramatically improving offline recognition
 * accuracy for a small model versus open, full-vocabulary decoding.
 * "[unk]" is Vosk's required catch-all token for anything outside the list.
 */
export function buildVoskGrammar(keywords: MatchableKeyword[]): string[] {
  const entries = new Set<string>();
  for (const kw of keywords) {
    for (const candidate of [kw.phrase, ...kw.aliases]) {
      const norm = normalizeText(candidate);
      if (!norm) continue;
      entries.add(norm);
      for (const word of norm.split(" ")) entries.add(word);
    }
  }
  entries.add("[unk]");
  return [...entries];
}

/**
 * Only checks the next expected keyword (and a small lookahead window), so a
 * live sermon advances sequentially instead of firing on any phrase anywhere
 * in the script.
 */
export function matchNext(
  transcriptChunk: string,
  orderedKeywords: MatchableKeyword[],
  pointer: number,
  lookahead = 2
): Match | null {
  const norm = normalizeText(transcriptChunk);
  if (!norm) return null;
  const end = Math.min(orderedKeywords.length - 1, pointer + lookahead);
  for (let i = pointer; i <= end; i++) {
    const kw = orderedKeywords[i];
    if (!kw) continue;
    for (const candidate of [kw.phrase, ...kw.aliases]) {
      const nc = normalizeText(candidate);
      if (!nc) continue;
      const re = new RegExp(`(?:^|\\s)${escapeRegex(nc)}(?:\\s|$)`);
      if (re.test(norm)) {
        return { index: i, keywordId: kw.id, matchedText: candidate };
      }
    }
  }
  return null;
}
