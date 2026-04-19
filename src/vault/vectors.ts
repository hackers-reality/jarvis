import { getDb, generateId } from './schema.ts';
import { pipeline, env } from '@xenova/transformers';

// Configure transformers for local-only use
env.allowLocalModels = true;
env.useBrowserCache = false;

export type VectorRecord = {
  id: string;
  ref_type: string;
  ref_id: string;
  content: string | null;
  embedding: Float32Array;
  model: string;
  created_at: number;
};

type VectorRow = {
  id: string;
  ref_type: string;
  ref_id: string;
  content: string | null;
  embedding: ArrayBuffer;
  model: string;
  created_at: number;
};

let embeddingPipeline: any = null;

/**
 * Get or initialize the embedding pipeline
 */
async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    console.log('[Vectors] Initializing local embedding engine (all-MiniLM-L6-v2)...');
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embeddingPipeline;
}

/**
 * Generate embedding for text
 */
export async function embedText(text: string): Promise<Float32Array> {
  const extractor = await getEmbeddingPipeline();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return new Float32Array(output.data);
}

/**
 * Parse vector row from database, converting BLOB to Float32Array
 */
export function parseVector(row: VectorRow): VectorRecord {
  return {
    ...row,
    embedding: new Float32Array(row.embedding),
  };
}

/**
 * Store a vector embedding for a reference entity or fact
 */
export function storeVector(
  ref_type: string,
  ref_id: string,
  embedding: Float32Array,
  content: string | null = null,
  model: string = 'all-MiniLM-L6-v2'
): VectorRecord {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  // Convert Float32Array to Buffer for SQLite BLOB storage
  const buffer = Buffer.from(embedding.buffer);

  const stmt = db.prepare(
    'INSERT INTO vectors (id, ref_type, ref_id, content, embedding, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  stmt.run(id, ref_type, ref_id, content, buffer, model, now);

  return {
    id,
    ref_type,
    ref_id,
    content,
    embedding,
    model,
    created_at: now,
  };
}

/**
 * Find similar vectors using cosine similarity
 */
export function findSimilar(
  queryEmbedding: Float32Array,
  limit: number = 10
): Array<{ ref_type: string; ref_id: string; content: string | null; similarity: number }> {
  const db = getDb();
  const rows = db.prepare('SELECT ref_type, ref_id, content, embedding FROM vectors').all() as any[];
  
  const results = rows.map(row => {
    const uint8 = new Uint8Array(row.embedding);
    const targetEmbedding = new Float32Array(uint8.buffer, uint8.byteOffset, uint8.byteLength / 4);
    return {
      ref_type: row.ref_type,
      ref_id: row.ref_id,
      content: row.content,
      similarity: cosineSimilarity(queryEmbedding, targetEmbedding)
    };
  });

  // Sort by similarity descending and slice
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(v1: Float32Array, v2: Float32Array): number {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    mA += v1[i] * v1[i];
    mB += v2[i] * v2[i];
  }
  return dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
}

/**
 * Delete all vectors for a given reference
 */
export function deleteVectors(ref_type: string, ref_id: string): void {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM vectors WHERE ref_type = ? AND ref_id = ?');
  stmt.run(ref_type, ref_id);
}
