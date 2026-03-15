import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

let openAiClient: OpenAI | null = null;

const getOpenAiClient = (): OpenAI => {
  if (openAiClient) {
    return openAiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate embeddings.");
  }

  openAiClient = new OpenAI({ apiKey });
  return openAiClient;
};

export const buildEmbeddingInput = (
  title: string,
  content: string,
  tags: string[],
): string => {
  const normalizedTags = tags.length > 0 ? tags.join(", ") : "none";
  return `Title: ${title}\nTags: ${normalizedTags}\nContent: ${content}`;
};

export const generateEmbedding = async (text: string): Promise<number[]> => {
  const client = getOpenAiClient();
  const response = await client.embeddings.create({
    model: embeddingModel,
    input: text,
  });

  const [embedding] = response.data;
  if (!embedding) {
    throw new Error("Embedding generation returned no vectors.");
  }

  return embedding.embedding;
};
