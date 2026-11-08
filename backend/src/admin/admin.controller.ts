import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('exams')
  async getExams() {
    return this.adminService.getExams();
  }

  @Delete('exams/:examId')
  async deleteExam(@Param('examId') examId: string) {
    return this.adminService.deleteExam(examId);
  }

  @Get('users')
  async getUsers() {
    return this.adminService.getUsers();
  }

  @Patch('users/:userId/role')
  async changeUserRole(
    @Param('userId') userId: string,
    @Body() body: { role: 'user' | 'admin' },
  ) {
    return this.adminService.changeUserRole(userId, body.role);
  }

  @Patch('users/:userId/password')
  async resetUserPassword(
    @Param('userId') userId: string,
    @Body() body: { newPassword: string },
  ) {
    return this.adminService.resetUserPassword(userId, body.newPassword);
  }

  @Delete('users/:userId')
  async deleteUser(@Param('userId') userId: string) {
    return this.adminService.deleteUser(userId);
  }

  @Get('progress')
  async getAllUsersProgress() {
    return this.adminService.getAllUsersProgress();
  }

  @Get('progress/:userId')
  async getUserProgress(@Param('userId') userId: string) {
    return this.adminService.getUserProgress(userId);
  }

  @Delete('progress/:userId')
  async resetUserProgress(@Param('userId') userId: string) {
    return this.adminService.resetUserProgress(userId);
  }

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('openai-usage')
  async getOpenAIUsage() {
    return this.adminService.getOpenAIUsage();
  }

  @Get('questions/stats')
  async getQuestionStats() {
    return this.adminService.getQuestionStats();
  }

  @Get('questions')
  async getQuestions(
    @Query('subjectSlug') subjectSlug?: string,
    @Query('unitNumber') unitNumber?: string,
    @Query('difficulty') difficulty?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getQuestions({
      subjectSlug,
      unitNumber: unitNumber ? Number(unitNumber) : undefined,
      difficulty,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Delete('questions/:id')
  async deleteQuestion(@Param('id') id: string) {
    return this.adminService.deleteQuestion(id);
  }

  @Get('incorrect-records/stats')
  async getIncorrectRecordStats() {
    return this.adminService.getIncorrectRecordStats();
  }

  @Delete('incorrect-records/bulk')
  async bulkDeleteIncorrectRecords(
    @Body() body: { userId?: string; subjectSlug?: string },
  ) {
    return this.adminService.bulkDeleteIncorrectRecords(body);
  }

  @Get('incorrect-records')
  async getIncorrectRecords(
    @Query('userId') userId?: string,
    @Query('subjectSlug') subjectSlug?: string,
    @Query('isGraduated') isGraduated?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getIncorrectRecords({
      userId,
      subjectSlug,
      isGraduated,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Delete('incorrect-records/:id')
  async deleteIncorrectRecord(@Param('id') id: string) {
    return this.adminService.deleteIncorrectRecord(id);
  }
}
