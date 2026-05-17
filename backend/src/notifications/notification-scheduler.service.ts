import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { NotificationSetting } from '../entities/notification-setting.entity';
import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';
import { IncorrectRecord } from '../entities/incorrect-record.entity';
import { PushSubscription } from '../entities/push-subscription.entity';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    @InjectRepository(NotificationSetting)
    private readonly settingRepo: Repository<NotificationSetting>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(IncorrectRecord)
    private readonly incorrectRepo: Repository<IncorrectRecord>,
    @InjectRepository(PushSubscription)
    private readonly pushSubRepo: Repository<PushSubscription>,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleReviewReminders() {
    const now = new Date();
    const currentHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const settings = await this.settingRepo.find({
      where: { reminderEnabled: true, reminderTime: currentHHmm },
    });

    for (const setting of settings) {
      try {
        const count = await this.incorrectRepo.count({
          where: { userId: setting.userId, isGraduated: false },
        });
        if (count === 0) continue;

        const lastNotification = await this.notificationRepo.findOne({
          where: {
            userId: setting.userId,
            type: NotificationType.REVIEW_REMINDER,
          },
          order: { createdAt: 'DESC' },
        });

        if (
          lastNotification &&
          Date.now() - lastNotification.createdAt.getTime() <
            setting.reminderFrequencyDays * 86400000
        ) {
          continue;
        }

        const overdueCount = await this.incorrectRepo
          .createQueryBuilder('ir')
          .where('ir.user_id = :userId', { userId: setting.userId })
          .andWhere('ir.is_graduated = false')
          .andWhere(
            '(ir.last_reviewed_at IS NULL OR ir.last_reviewed_at <= :threshold)',
            {
              threshold: new Date(
                Date.now() - setting.reminderConditionDays * 86400000,
              ),
            },
          )
          .getCount();

        if (overdueCount === 0) continue;

        const notification = this.notificationRepo.create({
          userId: setting.userId,
          type: NotificationType.REVIEW_REMINDER,
          title: '오답 복습 알림',
          message: `복습할 오답이 ${count}개 있습니다. 지금 복습해보세요!`,
        });
        await this.notificationRepo.save(notification);

        if (setting.pushEnabled) {
          await this.sendPush(
            setting.userId,
            '오답 복습 알림',
            `복습할 오답이 ${count}개 있습니다. 지금 복습해보세요!`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Failed to process reminder for user ${setting.userId}: ${err.message}`,
        );
      }
    }
  }

  private async sendPush(userId: string, title: string, body: string) {
    const vapidPublic = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const vapidPrivate = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const vapidSubject =
      this.configService.get<string>('VAPID_SUBJECT') ||
      'mailto:admin@example.com';

    if (!vapidPublic || !vapidPrivate) {
      this.logger.warn('VAPID keys not configured, skipping push');
      return;
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const subscriptions = await this.pushSubRepo.find({ where: { userId } });
    const payload = JSON.stringify({ title, body, url: '/review' });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await this.pushSubRepo.remove(sub);
          this.logger.log(`Removed expired subscription ${sub.id}`);
        } else {
          this.logger.error(`Push failed for ${sub.id}: ${err.message}`);
        }
      }
    }
  }
}
