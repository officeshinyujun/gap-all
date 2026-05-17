import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { Notification } from '../entities/notification.entity';
import { NotificationSetting } from '../entities/notification-setting.entity';
import { PushSubscription } from '../entities/push-subscription.entity';
import { IncorrectRecord } from '../entities/incorrect-record.entity';

@Module({
  imports: [
    ScheduleModule,
    TypeOrmModule.forFeature([
      Notification,
      NotificationSetting,
      PushSubscription,
      IncorrectRecord,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationSchedulerService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
