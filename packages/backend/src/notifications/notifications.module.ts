import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity } from './notification.entity';
import { NotificationPreference } from './notification-preference.entity';
import { NotificationsService } from './notifications.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsController } from './notifications.controller';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { ExternalDispatcherModule } from './external-dispatcher/external-dispatcher.module';
import { ClosingSoonService } from './closing-soon.service';
import { Call } from '../calls/entities/call.entity';
import { Stake } from '../analytics/entities/stake.entity';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { WebPushService } from './web-push.service';
import { PushController } from './push.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEntity,
      NotificationPreference,
      PushSubscriptionEntity,
      Call,
      Stake,
    ]),
    ExternalDispatcherModule,
  ],
  controllers: [
    NotificationsController,
    NotificationPreferencesController,
    PushController,
  ],
  providers: [
    NotificationsService,
    NotificationPreferencesService,
    ClosingSoonService,
    WebPushService,
  ],
  exports: [NotificationsService, NotificationPreferencesService, WebPushService],
})
export class NotificationsModule {}
