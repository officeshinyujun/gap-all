import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('sessions')
  async findAllSessions(@CurrentUser() user: CurrentUserPayload) {
    return this.chatService.findAllSessions(user.id);
  }

  @Post('sessions')
  async createSession(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateSessionDto,
  ) {
    return this.chatService.createSession(user.id, dto);
  }

  @Get('sessions/:sessionId')
  async findOneSession(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId') sessionId: string,
  ) {
    return this.chatService.findOneSession(user.id, sessionId);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  async removeSession(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId') sessionId: string,
  ) {
    return this.chatService.removeSession(user.id, sessionId);
  }

  @Post('sessions/:sessionId/messages')
  async sendMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(user.id, sessionId, dto);
  }
}
