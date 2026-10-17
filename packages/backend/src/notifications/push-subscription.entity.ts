import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * A browser Web Push subscription (RFC 8291 / RFC 8292).
 *
 * One row per browser/device a user has registered. Expired subscriptions
 * (HTTP 410 Gone from the push service) are pruned automatically.
 */
@Entity('push_subscriptions')
@Index('IDX_push_sub_user', ['userId'])
export class PushSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stellar wallet address (or internal user id) owning this device. */
  @Column()
  userId: string;

  /** Unique push endpoint URL issued by the browser's push service. */
  @Column({ type: 'text', unique: true })
  endpoint: string;

  /** Client public key (P-256) used to derive the shared secret. */
  @Column({ type: 'text' })
  p256dh: string;

  /** Client auth secret. */
  @Column({ type: 'text' })
  auth: string;

  @Column({ type: 'bigint', nullable: true })
  expirationTime: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
