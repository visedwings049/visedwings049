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
 * Only checks the next expected keyword (and a small lookahead window), so a
 * live sermon advances sequentially instead of firing on any phrase anywhere
 * in the script. Returns the earliest matching index in [pointer, pointer+lookahead].
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
