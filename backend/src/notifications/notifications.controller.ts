import {
  Controller,
  Get,
  Patch,
  Delete,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UpdateNotificationSettingDto } from './dto/update-notification-setting.dto';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(@CurrentUser() user: CurrentUserPayload) {
    const [notifications, unreadCount] = await Promise.all([
      this.notificationsService.findAllByUser(user.id),
      this.notificationsService.getUnreadCount(user.id),
    ]);
    return { notifications, unreadCount };
  }

  @Patch(':id/read')
  async markAsRead(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  @Delete(':id')
  async delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    await this.notificationsService.deleteNotification(user.id, id);
    return { success: true };
  }

  @Get('settings')
  async getSettings(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.getSettings(user.id);
  }

  @Put('settings')
  async updateSettings(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateNotificationSettingDto,
  ) {
    return this.notificationsService.updateSettings(user.id, dto);
  }

  @Post('push-subscriptions')
  async subscribePush(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreatePushSubscriptionDto,
  ) {
    return this.notificationsService.subscribePush(user.id, dto);
  }

  @Delete('push-subscriptions')
  async unsubscribePush(
    @CurrentUser() user: CurrentUserPayload,
    @Body('endpoint') endpoint: string,
  ) {
    await this.notificationsService.unsubscribePush(user.id, endpoint);
    return { success: true };
  }
}
