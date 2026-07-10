import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getOpenAIClient } from '../lib/openai-keys';

interface QuestionEmbedding {
  id: string;
  unit: number;
  concept: string;
  source: string;
  text: string;
  embedding: number[];
}

interface EmbeddingsFile {
  model: string;
  totalQuestions: number;
  questions: QuestionEmbedding[];
}

@Injectable()
export class SimilarityValidatorService {
  private readonly logger = new Logger(SimilarityValidatorService.name);
  private readonly embeddingsPath: string;
  private embeddings: EmbeddingsFile | null = null;

  constructor() {
    this.embeddingsPath =
      process.env.EMBEDDINGS_PATH ??
      path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        'textbook',
        'question-patterns',
        'success',
        'embeddings.json',
      );
  }

  private loadEmbeddings(): EmbeddingsFile | null {
    if (this.embeddings) return this.embeddings;
    if (!fs.existsSync(this.embeddingsPath)) {
      this.logger.warn(`Embeddings file not found: ${this.embeddingsPath}`);
      return null;
    }
    try {
      const raw = fs.readFileSync(this.embeddingsPath, 'utf-8');
      const data: EmbeddingsFile = JSON.parse(raw);
      this.embeddings = data;
      this.logger.log(`Loaded ${data.totalQuestions} embeddings`);
      return data;
    } catch (err) {
      this.logger.warn(`Failed to load embeddings: ${err}`);
      return null;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  private buildComparisonText(
    questionStem: string,
    stimulusData: object,
    optionsList: string[],
    comboBlockText: string,
  ): string {
    const parts = [questionStem];
    const sd = JSON.stringify(stimulusData);
    if (sd.length > 20) parts.push(sd);
    if (optionsList.length > 0) parts.push(optionsList.join(' '));
    if (comboBlockText) parts.push(comboBlockText);
    return parts.join(' ').trim();
  }

  async validate(
    questionStem: string,
    stimulusData: object,
    optionsList: string[],
    comboBlockText: string,
    threshold: number = 0.78,
  ): Promise<{ passed: boolean; similarity: number; matchedSource: string | null; reason?: string }> {
    const emb = this.loadEmbeddings();
    if (!emb || !emb.questions || emb.questions.length === 0) {
      return { passed: true, similarity: 0, matchedSource: null };
    }

    const generatedText = this.buildComparisonText(
      questionStem,
      stimulusData,
      optionsList,
      comboBlockText,
    );
    if (!generatedText || generatedText.length < 20) {
      return { passed: true, similarity: 0, matchedSource: null };
    }

    // Compute embedding for the generated question (once)
    const openai = getOpenAIClient();
    const resp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: generatedText,
    });
    const genEmbedding = resp.data[0].embedding;

    // Compare against all real questions
    let maxSim = 0;
    let matchedId: string | null = null;
    let matchedSource: string | null = null;

    // Quick pre-filter: word-level Jaccard similarity
    const genWords = new Set(generatedText.toLowerCase().split(/\s+/));

    for (const q of emb.questions) {
      // Quick rejection by word overlap
      const realWords = new Set(q.text.toLowerCase().split(/\s+/));
      let overlap = 0;
      for (const w of genWords) {
        if (w.length > 1 && realWords.has(w)) overlap++;
      }
      const jaccard = overlap / (genWords.size + realWords.size - overlap);
      if (jaccard < 0.15 && genWords.size > 10) continue;

      const sim = this.cosineSimilarity(genEmbedding, q.embedding);
      if (sim > maxSim) {
        maxSim = sim;
        matchedId = q.id;
        matchedSource = q.source;
      }
    }

    if (maxSim >= threshold) {
      this.logger.warn(
        `Similarity FAIL: ${(maxSim * 100).toFixed(1)}% with ${matchedId} (${matchedSource})`,
      );
      return {
        passed: false,
        similarity: maxSim,
        matchedSource,
        reason: `기출문제와 ${(maxSim * 100).toFixed(1)}% 유사 (${matchedSource || '알 수 없음'})`,
      };
    }

    return { passed: true, similarity: maxSim, matchedSource: null };
  }
}
