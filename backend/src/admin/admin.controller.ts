import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private checkAdmin(user: CurrentUserPayload) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('관리자만 접근할 수 있습니다.');
    }
  }

  @Get('exams')
  async getExams(@CurrentUser() user: CurrentUserPayload) {
    this.checkAdmin(user);
    return this.adminService.getExams();
  }

  @Delete('exams/:examId')
  async deleteExam(
    @CurrentUser() user: CurrentUserPayload,
    @Param('examId') examId: string,
  ) {
    this.checkAdmin(user);
    return this.adminService.deleteExam(examId);
  }

  @Get('users')
  async getUsers(@CurrentUser() user: CurrentUserPayload) {
    this.checkAdmin(user);
    return this.adminService.getUsers();
  }

  @Patch('users/:userId/role')
  async changeUserRole(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId') userId: string,
    @Body() body: { role: 'user' | 'admin' },
  ) {
    this.checkAdmin(user);
    return this.adminService.changeUserRole(userId, body.role);
  }

  @Patch('users/:userId/password')
  async resetUserPassword(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId') userId: string,
    @Body() body: { newPassword: string },
  ) {
    this.checkAdmin(user);
    return this.adminService.resetUserPassword(userId, body.newPassword);
  }

  @Delete('users/:userId')
  async deleteUser(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId') userId: string,
  ) {
    this.checkAdmin(user);
    return this.adminService.deleteUser(userId);
  }

  @Get('progress')
  async getAllUsersProgress(@CurrentUser() user: CurrentUserPayload) {
    this.checkAdmin(user);
    return this.adminService.getAllUsersProgress();
  }

  @Get('progress/:userId')
  async getUserProgress(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId') userId: string,
  ) {
    this.checkAdmin(user);
    return this.adminService.getUserProgress(userId);
  }

  @Delete('progress/:userId')
  async resetUserProgress(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId') userId: string,
  ) {
    this.checkAdmin(user);
    return this.adminService.resetUserProgress(userId);
  }

  @Get('stats')
  async getStats(@CurrentUser() user: CurrentUserPayload) {
    this.checkAdmin(user);
    return this.adminService.getStats();
  }

  @Get('openai-usage')
  async getOpenAIUsage(@CurrentUser() user: CurrentUserPayload) {
    this.checkAdmin(user);
    return this.adminService.getOpenAIUsage();
  }

  @Get('questions/stats')
  async getQuestionStats(@CurrentUser() user: CurrentUserPayload) {
    this.checkAdmin(user);
    return this.adminService.getQuestionStats();
  }

  @Get('questions')
  async getQuestions(
    @CurrentUser() user: CurrentUserPayload,
    @Query('subjectSlug') subjectSlug?: string,
    @Query('unitNumber') unitNumber?: string,
    @Query('difficulty') difficulty?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.checkAdmin(user);
    return this.adminService.getQuestions({
      subjectSlug,
      unitNumber: unitNumber ? Number(unitNumber) : undefined,
      difficulty,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Delete('questions/:id')
  async deleteQuestion(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    this.checkAdmin(user);
    return this.adminService.deleteQuestion(id);
  }

  @Get('incorrect-records/stats')
  async getIncorrectRecordStats(@CurrentUser() user: CurrentUserPayload) {
    this.checkAdmin(user);
    return this.adminService.getIncorrectRecordStats();
  }

  @Delete('incorrect-records/bulk')
  async bulkDeleteIncorrectRecords(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { userId?: string; subjectSlug?: string },
  ) {
    this.checkAdmin(user);
    return this.adminService.bulkDeleteIncorrectRecords(body);
  }

  @Get('incorrect-records')
  async getIncorrectRecords(
    @CurrentUser() user: CurrentUserPayload,
    @Query('userId') userId?: string,
    @Query('subjectSlug') subjectSlug?: string,
    @Query('isGraduated') isGraduated?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.checkAdmin(user);
    return this.adminService.getIncorrectRecords({
      userId,
      subjectSlug,
      isGraduated,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Delete('incorrect-records/:id')
  async deleteIncorrectRecord(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    this.checkAdmin(user);
    return this.adminService.deleteIncorrectRecord(id);
  }
}
