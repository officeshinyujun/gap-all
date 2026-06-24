import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatAiService } from './chat-ai.service';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage } from '../entities/chat-message.entity';
import { Subject } from '../entities/subject.entity';
import { AiUsageLog } from '../entities/ai-usage-log.entity';
import { TextbookModule } from '../textbook/textbook.module';
import { StudyModule } from '../study/study.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatSession, ChatMessage, Subject, AiUsageLog]),
    TextbookModule,
    StudyModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatAiService],
})
export class ChatModule {}
