import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';
import { NotificationSetting } from '../entities/notification-setting.entity';
import { PushSubscription } from '../entities/push-subscription.entity';
import { UpdateNotificationSettingDto } from './dto/update-notification-setting.dto';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationSetting)
    private readonly settingRepo: Repository<NotificationSetting>,
    @InjectRepository(PushSubscription)
    private readonly pushSubRepo: Repository<PushSubscription>,
    private readonly configService: ConfigService,
  ) {}

  async findAllByUser(userId: string) {
    return this.notificationRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async getUnreadCount(userId: string) {
    return this.notificationRepo.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId },
    });
    if (!notification) {
      throw new NotFoundException('알림을 찾을 수 없습니다.');
    }
    notification.isRead = true;
    return this.notificationRepo.save(notification);
  }

  async deleteNotification(userId: string, notificationId: string) {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId },
    });
    if (!notification) {
      throw new NotFoundException('알림을 찾을 수 없습니다.');
    }
    await this.notificationRepo.remove(notification);
  }

  async getSettings(userId: string) {
    let settings = await this.settingRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = this.settingRepo.create({ userId });
      settings = await this.settingRepo.save(settings);
    }
    return settings;
  }

  async updateSettings(userId: string, dto: UpdateNotificationSettingDto) {
    let settings = await this.settingRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = this.settingRepo.create({ userId, ...dto });
    } else {
      Object.assign(settings, dto);
    }
    return this.settingRepo.save(settings);
  }

  async subscribePush(userId: string, dto: CreatePushSubscriptionDto) {
    const existing = await this.pushSubRepo.findOne({
      where: { endpoint: dto.endpoint },
    });
    if (existing) {
      existing.userId = userId;
      existing.p256dh = dto.p256dh;
      existing.auth = dto.auth;
      return this.pushSubRepo.save(existing);
    }
    const sub = this.pushSubRepo.create({ userId, ...dto });
    return this.pushSubRepo.save(sub);
  }

  async unsubscribePush(userId: string, endpoint: string) {
    const sub = await this.pushSubRepo.findOne({
      where: { userId, endpoint },
    });
    if (!sub) {
      throw new NotFoundException('구독 정보를 찾을 수 없습니다.');
    }
    await this.pushSubRepo.remove(sub);
  }

  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
  ): Promise<Notification> {
    const notification = this.notificationRepo.create({
      userId,
      type,
      title,
      message,
      isRead: false,
    });
    return this.notificationRepo.save(notification);
  }

  async createAndPushNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    url: string,
  ): Promise<Notification> {
    const notification = await this.createNotification(userId, type, title, message);
    await this.sendPush(userId, title, message, url).catch((err) =>
      this.logger.error(`Push failed for user ${userId}: ${err.message}`),
    );
    return notification;
  }

  private async sendPush(userId: string, title: string, body: string, url: string) {
    const vapidPublic = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const vapidPrivate = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const vapidSubject =
      this.configService.get<string>('VAPID_SUBJECT') || 'mailto:admin@example.com';

    if (!vapidPublic || !vapidPrivate) {
      this.logger.warn('VAPID keys not configured, skipping push');
      return;
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const subscriptions = await this.pushSubRepo.find({ where: { userId } });
    const payload = JSON.stringify({ title, body, url });

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
