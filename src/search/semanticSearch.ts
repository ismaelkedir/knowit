import type { KnowledgeEntry } from "../types/knowledge.js";

export interface RankedKnowledgeEntry extends KnowledgeEntry {
  score: number;
}

export const cosineSimilarity = (
  left: number[] | null,
  right: number[] | null,
): number => {
  if (!left || !right || left.length === 0 || right.length === 0) {
    return 0;
  }

  if (left.length !== right.length) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

export const rankEntriesBySimilarity = (
  entries: KnowledgeEntry[],
  queryEmbedding: number[],
): RankedKnowledgeEntry[] =>
  entries
    .map((entry) => ({
      ...entry,
      score: cosineSimilarity(entry.embedding, queryEmbedding),
    }))
    .sort((left, right) => right.score - left.score);

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);

export const rankEntriesByTextMatch = (
  entries: KnowledgeEntry[],
  query: string,
): RankedKnowledgeEntry[] => {
  const terms = tokenize(query);

  return entries
    .map((entry) => {
      const title = entry.title.toLowerCase();
      const content = entry.content.toLowerCase();
      const tagSet = new Set(entry.tags.map((tag) => tag.toLowerCase()));
      let score = 0;

      for (const term of terms) {
        if (title.includes(term)) {
          score += 0.5;
        }
        if (content.includes(term)) {
          score += 0.2;
        }
        if (tagSet.has(term)) {
          score += 0.3;
        }
      }

      const normalizedScore = terms.length > 0 ? Math.min(1, score / terms.length) : 0;

      return {
        ...entry,
        score: normalizedScore,
      };
    })
    .sort((left, right) => right.score - left.score);
};
