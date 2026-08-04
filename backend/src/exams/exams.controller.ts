import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Header,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AiUnitProfileService } from './ai-unit-profile.service';
import { AiBlueprintService } from './ai-blueprint.service';
import { PreviewAiBlueprintDto } from './dto/preview-ai-blueprint.dto';
import { assertAiBlueprintGenerationEnabled } from './ai-generation-feature';

@Controller('exams')
@UseGuards(JwtAuthGuard)
export class ExamsController {
  constructor(
    private readonly examsService: ExamsService,
    @Optional() private readonly aiUnitProfileService?: AiUnitProfileService,
    @Optional() private readonly aiBlueprintService?: AiBlueprintService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateExamDto,
  ) {
    return this.examsService.create(user.id, dto);
  }

  @Post('jobs')
  async createJob(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateExamDto,
  ) {
    return this.examsService.createJob(user.id, dto);
  }

  @Get('jobs/:jobId')
  @Throttle({ default: { ttl: 60000, limit: 120 } })
  async getJob(
    @CurrentUser() user: CurrentUserPayload,
    @Param('jobId') jobId: string,
  ) {
    return this.examsService.getJobAsync(user.id, jobId);
  }

  @Delete('jobs/:jobId')
  @HttpCode(HttpStatus.OK)
  removeJob(
    @CurrentUser() user: CurrentUserPayload,
    @Param('jobId') jobId: string,
  ) {
    return this.examsService.removeJob(user.id, jobId);
  }

  @Post('jobs/:jobId/cancel')
  @HttpCode(HttpStatus.OK)
  cancelJob(
    @CurrentUser() user: CurrentUserPayload,
    @Param('jobId') jobId: string,
  ) {
    return this.examsService.cancelJob(user.id, jobId);
  }

  @Get('concepts')
  @Public()
  @Header('Cache-Control', 'public, max-age=300, s-maxage=3600')
  getConcepts(
    @Query('subjectSlug') subjectSlug: string,
    @Query('startUnitNum') startUnitNum: string,
    @Query('endUnitNum') endUnitNum: string,
  ) {
    return this.examsService.getConceptsBySlug(
      subjectSlug,
      Number(startUnitNum),
      Number(endUnitNum),
    );
  }

  @Get('generation-profile')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  getGenerationProfile(
    @Query('subjectSlug') subjectSlug: string,
    @Query('startUnitNum') startUnitNum: string,
    @Query('endUnitNum') endUnitNum: string,
  ) {
    if (this.aiUnitProfileService === undefined) {
      throw new InternalServerErrorException(
        '생성 프로파일 서비스를 사용할 수 없습니다.',
      );
    }
    return this.aiUnitProfileService.getProfile(
      subjectSlug,
      Number(startUnitNum),
      Number(endUnitNum),
    );
  }

  @Post('ai-blueprints/preview')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  previewAiBlueprints(@Body() dto: PreviewAiBlueprintDto) {
    assertAiBlueprintGenerationEnabled();
    if (this.aiBlueprintService === undefined) {
      throw new InternalServerErrorException(
        'AI 블루프린트 서비스를 사용할 수 없습니다.',
      );
    }
    return this.aiBlueprintService.preview(dto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query('subject') subjectSlug?: string,
  ) {
    return this.examsService.findAll(user.id, user.role, subjectSlug);
  }

  @Get(':examId')
  async findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('examId') examId: string,
  ) {
    return this.examsService.findOne(user.id, examId, user.role);
  }

  @Delete(':examId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('examId') examId: string,
  ) {
    return this.examsService.remove(user.id, examId);
  }

  @Post(':examId/submit')
  @HttpCode(HttpStatus.OK)
  async submit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('examId') examId: string,
    @Body() body: { answers: { examItemId: string; answer: number }[] },
  ) {
    return this.examsService.submit(user.id, examId, body.answers);
  }

  @Patch(':examId/answers')
  @HttpCode(HttpStatus.OK)
  async saveAnswers(
    @CurrentUser() user: CurrentUserPayload,
    @Param('examId') examId: string,
    @Body() body: { answers: { examItemId: string; answer: number }[] },
  ) {
    return this.examsService.saveAnswers(user.id, examId, body.answers);
  }

  @Get(':examId/result')
  async getResult(
    @CurrentUser() user: CurrentUserPayload,
    @Param('examId') examId: string,
  ) {
    return this.examsService.getResult(user.id, examId);
  }

  @Post(':examId/items/:itemId/flag')
  @HttpCode(HttpStatus.OK)
  async flagItem(
    @CurrentUser() user: CurrentUserPayload,
    @Param('examId') examId: string,
    @Param('itemId') itemId: string,
    @Body() body: { reason?: string },
  ) {
    return this.examsService.flagItem(user.id, examId, itemId, body?.reason);
  }
}
