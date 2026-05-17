import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  StudyService,
  DeleteCacheBulkDto,
  RegenerateCacheDto,
} from './study.service';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { SubmitReviewResultDto } from './dto/submit-review-result.dto';
import { CreateIncorrectRecordsDto } from './dto/create-incorrect-records.dto';
import { ReviewGenerateDto } from './dto/review-generate.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import type { QuizCount, CacheType } from './study-quiz-generator.service';
import { TextbookEmbeddingService } from '../textbook/textbook-embedding.service';

@Controller('study')
@UseGuards(JwtAuthGuard)
export class StudyController {
  constructor(
    private readonly studyService: StudyService,
    private readonly embeddingService: TextbookEmbeddingService,
  ) {}

  @Get('streak')
  async getStreak(@CurrentUser() user: CurrentUserPayload) {
    return this.studyService.getStreak(user.id);
  }

  @Get('review-recommendations')
  async getReviewRecommendations(@CurrentUser() user: CurrentUserPayload) {
    return this.studyService.getReviewRecommendations(user.id);
  }

  @Post('progress')
  async updateProgress(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.studyService.updateProgress(user.id, dto);
  }

  @Post('incorrect-records')
  async saveIncorrectRecords(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateIncorrectRecordsDto,
  ) {
    return this.studyService.saveIncorrectRecords(user.id, dto);
  }

  @Post('review-result')
  async submitReviewResult(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SubmitReviewResultDto,
  ) {
    return this.studyService.submitReviewResult(user.id, dto);
  }

  @Post('review-generate')
  async createReviewExamJob(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ReviewGenerateDto,
  ) {
    return this.studyService.createReviewExamJob(user.id, dto);
  }

  @Post('questions-by-ids')
  async getQuestionsByIds(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { questionIds: string[] },
  ) {
    return this.studyService.getQuestionsByIds(body.questionIds);
  }

  @Get('concept-bookmarks')
  async getConceptBookmarks(@CurrentUser() user: CurrentUserPayload) {
    return this.studyService.getConceptBookmarks(user.id);
  }

  @Post('concept-bookmarks')
  async addConceptBookmark(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { subjectSlug: string; unitNumber: number; conceptName: string; description?: string },
  ) {
    return this.studyService.addConceptBookmark(user.id, body);
  }

  @Delete('concept-bookmarks/:id')
  async removeConceptBookmark(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.studyService.removeConceptBookmark(user.id, id);
  }

  @Get('cache-status')
  getCacheStatus(@CurrentUser() user: CurrentUserPayload) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('관리자만 접근할 수 있습니다.');
    }
    return this.studyService.getCacheStatus();
  }

  @Delete('cache-bulk')
  deleteCacheBulk(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: DeleteCacheBulkDto,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('관리자만 캐시를 삭제할 수 있습니다.');
    }
    return this.studyService.deleteCacheBulk(dto);
  }

  @Post('cache-regenerate')
  regenerateCache(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RegenerateCacheDto,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('관리자만 캐시를 재생성할 수 있습니다.');
    }
    return this.studyService.regenerateCache(dto);
  }

  @Get('cache-regenerate-status')
  getRegenerationStatus(@CurrentUser() user: CurrentUserPayload) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('관리자만 접근할 수 있습니다.');
    }
    return this.studyService.getRegenerationStatus();
  }

  @Get(':subjectSlug/progress')
  async getProgress(
    @CurrentUser() user: CurrentUserPayload,
    @Param('subjectSlug') subjectSlug: string,
  ) {
    return this.studyService.getProgressBySubject(user.id, subjectSlug);
  }

  @Get(':subjectSlug/units')
  async getUnitsWithProgress(
    @CurrentUser() user: CurrentUserPayload,
    @Param('subjectSlug') subjectSlug: string,
  ) {
    return this.studyService.getUnitsWithProgress(user.id, subjectSlug);
  }

  @Get(':subjectSlug/:unitNumber/concept')
  async getConcept(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
    @Query('name') name: string,
  ) {
    const concept = this.studyService.getConceptByName(subjectSlug, unitNumber, name);
    if (!concept) {
      return { found: false, title: name, description: '', bulletPoints: [], trapPoints: [], logicFlow: '' };
    }
    return { found: true, ...concept };
  }

  @Get(':subjectSlug/:unitNumber/concept-md')
  async getConceptMd(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
  ) {
    return this.studyService.getConceptMd(subjectSlug, unitNumber);
  }

  @Get(':subjectSlug/:unitNumber/blank-questions')
  async getBlankQuestions(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
    @Query('count') countStr?: string,
  ) {
    const count = countStr === '20' ? 20 : 10;
    return this.studyService.getBlankQuestions(subjectSlug, unitNumber, count);
  }

  @Get(':subjectSlug/:unitNumber/concept-pairs')
  async getConceptPairs(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
    @Query('count') countStr?: string,
  ) {
    const count = countStr === '20' ? 20 : 10;
    return this.studyService.getConceptPairs(subjectSlug, unitNumber, count);
  }

  @Delete(':subjectSlug/:unitNumber/cache')
  async clearCache(
    @CurrentUser() user: CurrentUserPayload,
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
    @Query('type') type?: string,
    @Query('count') countStr?: string,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('관리자만 캐시를 삭제할 수 있습니다.');
    }
    const cacheType = type === 'blank' || type === 'concept' ? type : undefined;
    const count = countStr === '10' ? 10 : countStr === '20' ? 20 : undefined;
    this.studyService.clearCache(subjectSlug, unitNumber, cacheType, count);
    return { message: '캐시가 삭제되었습니다.' };
  }

  // ============================================================
  // RAG 임베딩 관리 (admin 전용)
  // ============================================================

  @Post(':subjectSlug/embed-units')
  async embedAllUnits(
    @CurrentUser() user: CurrentUserPayload,
    @Param('subjectSlug') subjectSlug: string,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('관리자만 임베딩을 생성할 수 있습니다.');
    }
    const results = await this.embeddingService.embedAllUnits(subjectSlug);
    return { message: '임베딩 생성 완료', results };
  }

  @Post(':subjectSlug/:unitNumber/embed')
  async embedUnit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('관리자만 임베딩을 생성할 수 있습니다.');
    }
    const chunks = await this.embeddingService.embedUnit(
      subjectSlug,
      unitNumber,
    );
    return { message: `${unitNumber}단원 임베딩 완료`, chunks };
  }

  @Get(':subjectSlug/embedding-status')
  async getEmbeddingStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('subjectSlug') subjectSlug: string,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('관리자만 조회할 수 있습니다.');
    }
    return this.embeddingService.getEmbeddingStatus(subjectSlug);
  }
}
