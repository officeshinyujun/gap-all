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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('exams')
@UseGuards(JwtAuthGuard)
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

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
    return this.examsService.getJob(user.id, jobId);
  }

  @Get('concepts')
  @Public()
  async getConcepts(
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
}
