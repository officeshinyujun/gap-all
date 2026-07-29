import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  BadRequestException,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { ChatImageUploadService } from './chat-image-upload.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly imageUploadService: ChatImageUploadService,
  ) {}

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

  @Post('sessions/:sessionId/image-question')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        const supportedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!supportedMimeTypes.includes(file.mimetype)) {
          callback(new BadRequestException('JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async imageQuestion(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('이미지 파일이 필요합니다.');

    return this.chatService.processImageQuestion(
      user.id,
      sessionId,
      file.buffer,
      file.mimetype,
    );
  }

  @Get('images/:filename')
  @Public()
  getImage(@Param('filename') filename: string, @Res() res: Response) {
    const url = this.imageUploadService.getPublicUrl(filename);
    // The image request starts on the frontend origin and redirects to Supabase.
    // Override Helmet's default same-origin policy for this public image resource.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.redirect(url);
  }

  @Patch('messages/:messageId/answer')
  async saveAnswer(
    @CurrentUser() user: CurrentUserPayload,
    @Param('messageId') messageId: string,
    @Body() dto: { answer: number },
  ) {
    return this.chatService.saveAnswer(user.id, messageId, dto.answer);
  }
}
