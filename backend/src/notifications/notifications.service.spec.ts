import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { Notification } from '../entities/notification.entity';
import { NotificationSetting } from '../entities/notification-setting.entity';
import { PushSubscription } from '../entities/push-subscription.entity';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepo: jest.Mocked<Repository<Notification>>;
  let settingRepo: jest.Mocked<Repository<NotificationSetting>>;
  let pushSubRepo: jest.Mocked<Repository<PushSubscription>>;

  const mockNotification: Notification = {
    id: 'notif-1',
    userId: 'user-1',
    type: 'EXAM_COMPLETE' as any,
    title: '시험 완료',
    message: '시험이 생성되었습니다.',
    isRead: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSetting: NotificationSetting = {
    id: 'setting-1',
    userId: 'user-1',
    examComplete: true,
    streakReminder: true,
    reviewReminder: false,
  };

  const mockPushSub: PushSubscription = {
    id: 'sub-1',
    userId: 'user-1',
    endpoint: 'https://push.example.com/endpoint',
    p256dh: 'p256dh-key',
    auth: 'auth-key',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockNotifRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const mockSettingRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const mockPushSubRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const mockConfigService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: mockNotifRepo },
        { provide: getRepositoryToken(NotificationSetting), useValue: mockSettingRepo },
        { provide: getRepositoryToken(PushSubscription), useValue: mockPushSubRepo },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    notificationRepo = module.get(getRepositoryToken(Notification));
    settingRepo = module.get(getRepositoryToken(NotificationSetting));
    pushSubRepo = module.get(getRepositoryToken(PushSubscription));
  });

  describe('findAllByUser', () => {
    it('사용자 알림 최대 50개 반환', async () => {
      notificationRepo.find.mockResolvedValue([mockNotification]);
      const result = await service.findAllByUser('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getUnreadCount', () => {
    it('읽지 않은 알림 개수 반환', async () => {
      notificationRepo.count.mockResolvedValue(3);
      const result = await service.getUnreadCount('user-1');
      expect(result).toBe(3);
    });
  });

  describe('markAsRead', () => {
    it('알림을 읽음 처리', async () => {
      notificationRepo.findOne.mockResolvedValue({ ...mockNotification, isRead: false });
      notificationRepo.save.mockResolvedValue({ ...mockNotification, isRead: true });

      const result = await service.markAsRead('user-1', 'notif-1');
      expect(result.isRead).toBe(true);
    });

    it('없는 알림이면 NotFoundException', async () => {
      notificationRepo.findOne.mockResolvedValue(null);
      await expect(service.markAsRead('user-1', 'none')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllAsRead', () => {
    it('모든 알림 읽음 처리 성공', async () => {
      notificationRepo.update.mockResolvedValue({ affected: 5 } as any);
      const result = await service.markAllAsRead('user-1');
      expect(result.success).toBe(true);
    });
  });

  describe('deleteNotification', () => {
    it('알림 삭제 성공', async () => {
      notificationRepo.findOne.mockResolvedValue(mockNotification);
      notificationRepo.remove.mockResolvedValue(mockNotification);
      await service.deleteNotification('user-1', 'notif-1');
      expect(notificationRepo.remove).toHaveBeenCalled();
    });

    it('없는 알림이면 NotFoundException', async () => {
      notificationRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteNotification('user-1', 'none')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSettings', () => {
    it('설정이 있으면 반환', async () => {
      settingRepo.findOne.mockResolvedValue(mockSetting);
      const result = await service.getSettings('user-1');
      expect(result.examComplete).toBe(true);
    });

    it('설정이 없으면 기본값 생성 후 반환', async () => {
      settingRepo.findOne.mockResolvedValue(null);
      settingRepo.create.mockReturnValue({ userId: 'user-1' } as NotificationSetting);
      settingRepo.save.mockResolvedValue({ userId: 'user-1' } as NotificationSetting);

      const result = await service.getSettings('user-1');
      expect(result.userId).toBe('user-1');
    });
  });

  describe('updateSettings', () => {
    it('설정 업데이트', async () => {
      settingRepo.findOne.mockResolvedValue(mockSetting);
      settingRepo.save.mockResolvedValue({ ...mockSetting, examComplete: false });

      const result = await service.updateSettings('user-1', { examComplete: false });
      expect(result.examComplete).toBe(false);
    });
  });

  describe('subscribePush', () => {
    it('새로운 푸시 구독 생성', async () => {
      pushSubRepo.findOne.mockResolvedValue(null);
      pushSubRepo.create.mockReturnValue(mockPushSub);
      pushSubRepo.save.mockResolvedValue(mockPushSub);

      const result = await service.subscribePush('user-1', {
        endpoint: 'https://push.example.com/endpoint',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      });

      expect(result.endpoint).toBe('https://push.example.com/endpoint');
    });

    it('기존 endpoint가 있으면 업데이트', async () => {
      pushSubRepo.findOne.mockResolvedValue(mockPushSub);
      pushSubRepo.save.mockResolvedValue(mockPushSub);

      await service.subscribePush('user-1', {
        endpoint: 'https://push.example.com/endpoint',
        p256dh: 'new-p256dh',
        auth: 'new-auth',
      });

      expect(pushSubRepo.save).toHaveBeenCalled();
    });
  });

  describe('unsubscribePush', () => {
    it('푸시 구독 해제', async () => {
      pushSubRepo.findOne.mockResolvedValue(mockPushSub);
      pushSubRepo.remove.mockResolvedValue(mockPushSub);
      await service.unsubscribePush('user-1', 'https://push.example.com/endpoint');
      expect(pushSubRepo.remove).toHaveBeenCalled();
    });

    it('없는 구독이면 NotFoundException', async () => {
      pushSubRepo.findOne.mockResolvedValue(null);
      await expect(
        service.unsubscribePush('user-1', 'invalid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createNotification', () => {
    it('알림 생성 및 저장', async () => {
      notificationRepo.create.mockReturnValue(mockNotification);
      notificationRepo.save.mockResolvedValue(mockNotification);

      const result = await service.createNotification(
        'user-1',
        'EXAM_COMPLETE' as any,
        '시험 완료',
        '시험이 생성되었습니다.',
      );

      expect(result.title).toBe('시험 완료');
    });
  });
});
