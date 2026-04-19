import { test, expect, describe, beforeEach } from 'bun:test';
import { initDatabase } from './schema.ts';
import { embedText, storeVector, findSimilar } from './vectors.ts';

describe('Vector Memory', () => {
  beforeEach(() => {
    initDatabase(':memory:');
  });

  test('embedText generates a vector of correct length', async () => {
    const embedding = await embedText('Hello world');
    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(384); // all-MiniLM-L6-v2 dimension
  });

  test('store and retrieve similar vectors', async () => {
    const text1 = 'The capital of France is Paris';
    const text2 = 'The capital of Germany is Berlin';
    const text3 = 'I love eating pizza';

    const v1 = await embedText(text1);
    const v2 = await embedText(text2);
    const v3 = await embedText(text3);

    storeVector('test', '1', v1, text1);
    storeVector('test', '2', v2, text2);
    storeVector('test', '3', v3, text3);

    const query = await embedText('Which city is the French capital?');
    const results = findSimilar(query, 1);

    expect(results.length).toBe(1);
    expect(results[0]!.content).toBe(text1);
    expect(results[0]!.similarity).toBeGreaterThan(0.6);
  });
});
