import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PushSubscriptionEntity } from './push-subscription.entity';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
  userAgent?: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface PushDeliveryResult {
  attempted: number;
  delivered: number;
  pruned: number;
}

/** Status codes that mean a subscription is permanently dead. */
const GONE_STATUS_CODES = [404, 410];

/**
 * RFC 8292 VAPID Web Push delivery.
 *
 * `web-push` is required lazily so the module can be imported (and unit tested)
 * even when the dependency is unavailable at build time.
 */
@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private webpush: any | null = null;
  private configured = false;

  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private readonly repo: Repository<PushSubscriptionEntity>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.configure();
  }

  private configure(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject =
      this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:ops@backit.app';

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys are not configured — web push delivery is disabled',
      );
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.webpush = require('web-push');
      this.webpush.setVapidDetails(subject, publicKey, privateKey);
      this.configured = true;
    } catch {
      this.logger.warn('web-push dependency is unavailable');
    }
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  /** Public VAPID key clients need to create a push subscription. */
  getPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  async saveSubscription(
    userId: string,
    input: PushSubscriptionInput,
  ): Promise<PushSubscriptionEntity> {
    const existing = await this.repo.findOne({
      where: { endpoint: input.endpoint },
    });

    if (existing) {
      existing.userId = userId;
      existing.p256dh = input.keys.p256dh;
      existing.auth = input.keys.auth;
      existing.expirationTime = input.expirationTime ?? null;
      existing.userAgent = input.userAgent ?? existing.userAgent;
      return this.repo.save(existing);
    }

    const created = this.repo.create({
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      expirationTime: input.expirationTime ?? null,
      userAgent: input.userAgent ?? null,
    });
    return this.repo.save(created);
  }

  async removeSubscription(userId: string, endpoint: string): Promise<void> {
    await this.repo.delete({ userId, endpoint });
  }

  /**
   * Deliver a payload to every device registered by a user, pruning any
   * subscription the push service reports as gone (404/410).
   */
  async sendToUser(
    userId: string,
    payload: WebPushPayload,
  ): Promise<PushDeliveryResult> {
    const subscriptions = await this.repo.find({ where: { userId } });
    const result: PushDeliveryResult = {
      attempted: subscriptions.length,
      delivered: 0,
      pruned: 0,
    };

    if (!this.configured || !this.webpush) {
      this.logger.debug(
        `Skipping push to ${userId}: web push not configured (${subscriptions.length} subscription(s))`,
      );
      return result;
    }

    const body = JSON.stringify(payload);

    for (const sub of subscriptions) {
      const target = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      try {
        await this.webpush.sendNotification(target, body);
        result.delivered += 1;
      } catch (err: any) {
        const statusCode = err?.statusCode ?? err?.status;
        if (GONE_STATUS_CODES.includes(statusCode)) {
          await this.repo.delete({ id: sub.id });
          result.pruned += 1;
          this.logger.log(
            `Pruned expired push subscription ${sub.id} (status ${statusCode})`,
          );
        } else {
          this.logger.warn(
            `Push delivery failed for subscription ${sub.id}: ${
              err?.message ?? err
            }`,
          );
        }
      }
    }

    return result;
  }
}
