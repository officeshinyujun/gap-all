import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TextbookService } from './textbook.service';
import { getOpenAIClient } from '../lib/openai-keys';

const CHUNK_SIZE = 1500; // 청크당 최대 글자 수
const CHUNK_OVERLAP = 300; // 청크 간 겹침 글자 수
const EMBEDDING_MODEL = 'text-embedding-3-small';
const TOP_K = 15; // RAG 검색 시 반환할 청크 수 (8 → 15 증가)
const SENTENCE_BOUNDARY_WINDOW = 150; // 문장 경계 탐색 윈도우

@Injectable()
export class TextbookEmbeddingService {
  private readonly logger = new Logger(TextbookEmbeddingService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly textbookService: TextbookService,
  ) {}

  // ============================================================
  // 텍스트를 청크로 분할 (문장 경계 인식)
  // ============================================================
  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + CHUNK_SIZE, text.length);

      // 마지막 청크가 아니면, 문장 경계를 찾아 자연스럽게 자름
      if (end < text.length) {
        const searchStart = Math.max(start, end - SENTENCE_BOUNDARY_WINDOW);
        const searchRegion = text.slice(searchStart, end + SENTENCE_BOUNDARY_WINDOW);

        // 문장 종결 지점 찾기: 한글/영문 + 문장부호(.!?) + 공백/줄바꿈,
        // 또는 내용 사이의 줄바꿈
        const sentenceEnd = searchRegion.search(
          /(?<=[가-힣a-zA-Z)])[.!?](?=\s|\n|$)|\n(?=\S)/
        );

        if (sentenceEnd !== -1) {
          const adjusted = searchStart + sentenceEnd + 1;
          // 윈도우 내에서만 조정
          if (adjusted > start && adjusted < end + SENTENCE_BOUNDARY_WINDOW) {
            end = Math.min(adjusted, text.length);
          }
        } else {
          // 문장 경계를 못 찾았으면 최소한 공백에서 자름
          const spaceEnd = searchRegion.search(/\s(?=\S)/);
          if (spaceEnd !== -1) {
            end = Math.min(searchStart + spaceEnd + 1, text.length);
          }
        }
      }

      chunks.push(text.slice(start, end).trim());
      // 다음 청크 시작 위치: 겹침을 적용하되, 반드시 앞으로 진행
      const nextStart = end - CHUNK_OVERLAP;
      if (nextStart <= start) {
        // 겹침으로도 진행이 안 되면 최소 1글자 이상 진행
        start = start + 1;
      } else {
        start = nextStart;
      }
      if (start >= text.length) break;
    }

    return chunks.filter((c) => c.length > 50);
  }

  // ============================================================
  // 단일 단원 임베딩 생성 및 저장
  // ============================================================
  async embedUnit(subjectSlug: string, unitNumber: number): Promise<number> {
    this.logger.log(`임베딩 시작: ${subjectSlug} ${unitNumber}단원`);

    const raw = await this.textbookService.getSummationMd(subjectSlug, unitNumber);

    let text: string;
    try {
      text = this.textbookService.extractTextFromSummation(raw);
    } catch {
      text = raw;
    }

    const chunks = this.splitIntoChunks(text);

    // 기존 청크 삭제
    await this.dataSource.query(
      `DELETE FROM textbook_chunks WHERE subject_slug = $1 AND unit_number = $2`,
      [subjectSlug, unitNumber],
    );

    // 배치 임베딩 (OpenAI는 최대 2048개 입력 지원)
    const embeddings = await getOpenAIClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: chunks,
    });

    // DB 저장
    for (let i = 0; i < chunks.length; i++) {
      const vector = embeddings.data[i].embedding;
      const vectorStr = `[${vector.join(',')}]`;

      await this.dataSource.query(
        `INSERT INTO textbook_chunks (subject_slug, unit_number, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        [subjectSlug, unitNumber, i, chunks[i], vectorStr],
      );
    }

    this.logger.log(
      `임베딩 완료: ${subjectSlug} ${unitNumber}단원 (${chunks.length}개 청크)`,
    );
    return chunks.length;
  }

  // ============================================================
  // 과목 전체 단원 임베딩
  // ============================================================
  async embedAllUnits(
    subjectSlug: string,
  ): Promise<{ unitNumber: number; chunks: number }[]> {
    const results: { unitNumber: number; chunks: number }[] = [];

    for (let unitNumber = 1; unitNumber <= 20; unitNumber++) {
      try {
        const chunks = await this.embedUnit(subjectSlug, unitNumber);
        results.push({ unitNumber, chunks });
      } catch (err) {
        this.logger.warn(
          `${subjectSlug} ${unitNumber}단원 임베딩 실패: ${err}`,
        );
      }
    }

    return results;
  }

  // ============================================================
  // RAG 검색: 질문과 유사한 청크 반환 (pgvector cosine similarity)
  // ============================================================
  async searchSimilarChunks(
    subjectSlug: string,
    query: string,
    startUnit?: number,
    endUnit?: number,
    topK = TOP_K,
  ): Promise<string[]> {
    // 질문 임베딩
    const queryEmbedding = await getOpenAIClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: [query],
    });

    const vector = queryEmbedding.data[0].embedding;
    const vectorStr = `[${vector.join(',')}]`;

    const from = startUnit ?? 1;
    const to = endUnit ?? 20;

    // pgvector cosine similarity 검색 (더 많은 결과를 가져와 diversity 확보)
    const rows: { content: string; unit_number: number }[] = await this.dataSource.query(
      `SELECT content, unit_number
       FROM textbook_chunks
       WHERE subject_slug = $1
         AND unit_number BETWEEN $2 AND $3
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $4::vector
       LIMIT $5`,
      [subjectSlug, from, to, vectorStr, topK],
    );

    // 단원 분산을 위한 diversity-aware 반환 (같은 단원에서만 너무 많이 오지 않도록)
    const seenUnits = new Set<number>();
    const diverse: string[] = [];
    const rest: string[] = [];

    for (const r of rows) {
      if (!seenUnits.has(r.unit_number) && diverse.length < 8) {
        seenUnits.add(r.unit_number);
        diverse.push(r.content);
      } else {
        rest.push(r.content);
      }
    }

    return [...diverse, ...rest].slice(0, topK);
  }

  // ============================================================
  // 특정 단원의 모든 청크 반환 (단원 번호 명시 질문용)
  // ============================================================
  async getAllChunksForUnit(
    subjectSlug: string,
    unitNumber: number,
  ): Promise<string[]> {
    const rows: { content: string }[] = await this.dataSource.query(
      `SELECT content
       FROM textbook_chunks
       WHERE subject_slug = $1
         AND unit_number = $2
       ORDER BY chunk_index ASC`,
      [subjectSlug, unitNumber],
    );

    return rows.map((r) => r.content);
  }

  async searchChunksByKeyword(
    subjectSlug: string,
    keyword: string,
    startUnit?: number,
    endUnit?: number,
    limit = TOP_K,
  ): Promise<string[]> {
    const from = startUnit ?? 1;
    const to = endUnit ?? 20;

    const rows: { content: string }[] = await this.dataSource.query(
      `SELECT content
       FROM textbook_chunks
       WHERE subject_slug = $1
         AND unit_number BETWEEN $2 AND $3
         AND content ILIKE $4
       ORDER BY unit_number ASC, chunk_index ASC
       LIMIT $5`,
      [subjectSlug, from, to, `%${keyword}%`, limit],
    );

    return rows.map((r) => r.content);
  }

  // ============================================================
  // 임베딩 현황 조회
  // ============================================================
  async getEmbeddingStatus(
    subjectSlug: string,
  ): Promise<{ unitNumber: number; chunkCount: number }[]> {
    const rows: { unit_number: number; chunk_count: string }[] =
      await this.dataSource.query(
        `SELECT unit_number, COUNT(*) as chunk_count
       FROM textbook_chunks
       WHERE subject_slug = $1
       GROUP BY unit_number
       ORDER BY unit_number`,
        [subjectSlug],
      );

    return rows.map((r) => ({
      unitNumber: r.unit_number,
      chunkCount: parseInt(r.chunk_count, 10),
    }));
  }
}
