import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../entities/user.entity';
import { Question } from '../entities/question.entity';
import { ExamRecord } from '../entities/exam-record.entity';
import { AiUsageLog } from '../entities/ai-usage-log.entity';
import { StudyProgress } from '../entities/study-progress.entity';
import { IncorrectRecord } from '../entities/incorrect-record.entity';
import { Subject } from '../entities/subject.entity';
import { Unit } from '../entities/unit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Question,
      ExamRecord,
      AiUsageLog,
      StudyProgress,
      IncorrectRecord,
      Subject,
      Unit,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
