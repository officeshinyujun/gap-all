import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  StudyService,
  DeleteCacheBulkDto,
  RegenerateCacheDto,
} from './study.service';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { UpdateSummationDto } from './dto/update-summation.dto';
import { SubmitReviewResultDto } from './dto/submit-review-result.dto';
import { CreateIncorrectRecordsDto } from './dto/create-incorrect-records.dto';
import { ReviewGenerateDto } from './dto/review-generate.dto';
import {
  ReviewQuestionsDto,
  SubmitReviewAnswerDto,
} from './dto/review-question.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { TextbookEmbeddingService } from '../textbook/textbook-embedding.service';

@Controller('study')
@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Post('review-questions')
  async getReviewQuestions(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ReviewQuestionsDto,
  ) {
    return this.studyService.getReviewQuestions(user.id, dto.questionIds);
  }

  @Post('review-questions/:questionId/answer')
  async submitReviewAnswer(
    @CurrentUser() user: CurrentUserPayload,
    @Param('questionId') questionId: string,
    @Body() dto: SubmitReviewAnswerDto,
  ) {
    return this.studyService.submitReviewAnswer(user.id, questionId, dto.answer);
  }

  @Get('concept-bookmarks')
  async getConceptBookmarks(@CurrentUser() user: CurrentUserPayload) {
    return this.studyService.getConceptBookmarks(user.id);
  }

  @Post('concept-bookmarks')
  async addConceptBookmark(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      subjectSlug: string;
      unitNumber: number;
      conceptName: string;
      description?: string;
    },
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
  @Roles('admin')
  getCacheStatus() {
    return this.studyService.getCacheStatus();
  }

  @Delete('cache-bulk')
  @Roles('admin')
  deleteCacheBulk(@Body() dto: DeleteCacheBulkDto) {
    return this.studyService.deleteCacheBulk(dto);
  }

  @Post('cache-regenerate')
  @Roles('admin')
  regenerateCache(@Body() dto: RegenerateCacheDto) {
    return this.studyService.regenerateCache(dto);
  }

  @Get('cache-regenerate-status')
  @Roles('admin')
  getRegenerationStatus() {
    return this.studyService.getRegenerationStatus();
  }

  @Get(':subjectSlug/summation/:unitNumber')
  getSummationCards(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
  ) {
    return this.studyService.getSummationCards(subjectSlug, unitNumber);
  }

  @Get(':subjectSlug/summation-v2/:unitNumber')
  getSummationV2Cards(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
  ) {
    return this.studyService.getSummationV2Cards(subjectSlug, unitNumber);
  }

  @Put(':subjectSlug/summation/:unitNumber')
  @Roles('admin')
  async updateSummationCards(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
    @Body() dto: UpdateSummationDto,
  ) {
    return this.studyService.updateSummationCards(
      subjectSlug,
      unitNumber,
      dto.cards,
    );
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

  @Get(':subjectSlug/:unitNumber/frequency-concept')
  getFrequencyConcept(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
  ) {
    return this.studyService.getFrequencyConcept(subjectSlug, unitNumber);
  }

  @Get(':subjectSlug/:unitNumber/exam-patterns')
  getStudyExamPatterns(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
  ) {
    return this.studyService.getStudyExamPatterns(subjectSlug, unitNumber);
  }

  @Get(':subjectSlug/:unitNumber/mindmap')
  getMindmap(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
  ) {
    return this.studyService.getMindmap(subjectSlug, unitNumber);
  }

  @Get(':subjectSlug/:unitNumber/concept')
  async getConcept(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
    @Query('name') name: string,
  ) {
    const concept = await this.studyService.getConceptByName(
      subjectSlug,
      unitNumber,
      name,
    );
    if (!concept) {
      return {
        found: false,
        title: name,
        description: '',
        bulletPoints: [],
        trapPoints: [],
        logicFlow: '',
      };
    }
    return { found: true, ...concept };
  }

  @Get(':subjectSlug/:unitNumber/structured-concept')
  getStructuredConcept(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
  ) {
    return this.studyService.getStructuredConcept(subjectSlug, unitNumber);
  }

  @Get(':subjectSlug/:unitNumber/concept-md')
  getConceptMd(
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
  @Roles('admin')
  clearCache(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
    @Query('type') type?: string,
    @Query('count') countStr?: string,
  ) {
    const cacheType = type === 'blank' || type === 'concept' ? type : undefined;
    const count = countStr === '10' ? 10 : countStr === '20' ? 20 : undefined;
    this.studyService.clearCache(subjectSlug, unitNumber, cacheType, count);
    return { message: '캐시가 삭제되었습니다.' };
  }

  // ============================================================
  // RAG 임베딩 관리 (admin 전용)
  // ============================================================

  @Post(':subjectSlug/embed-units')
  @Roles('admin')
  async embedAllUnits(
    @Param('subjectSlug') subjectSlug: string,
  ) {
    const results = await this.embeddingService.embedAllUnits(subjectSlug);
    return { message: '임베딩 생성 완료', results };
  }

  @Post(':subjectSlug/:unitNumber/embed')
  @Roles('admin')
  async embedUnit(
    @Param('subjectSlug') subjectSlug: string,
    @Param('unitNumber', ParseIntPipe) unitNumber: number,
  ) {
    const chunks = await this.embeddingService.embedUnit(
      subjectSlug,
      unitNumber,
    );
    return { message: `${unitNumber}단원 임베딩 완료`, chunks };
  }

  @Get(':subjectSlug/embedding-status')
  @Roles('admin')
  async getEmbeddingStatus(
    @Param('subjectSlug') subjectSlug: string,
  ) {
    return this.embeddingService.getEmbeddingStatus(subjectSlug);
  }
}
