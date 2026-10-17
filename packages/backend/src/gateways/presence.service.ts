import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Heartbeats older than this are considered stale (rolling 60s TTL). */
export const PRESENCE_TTL_MS = 60_000;

export interface PresenceMetrics {
  trackedMarkets: number;
  onlineUsers: number;
}

/**
 * Real-time presence tracker backed by Redis Sorted Sets.
 *
 * Each market gets a sorted set whose members are user identifiers scored by
 * their last heartbeat timestamp. Stale members (older than
 * {@link PRESENCE_TTL_MS}) are pruned on read, which keeps the memory footprint
 * bounded without a cron. When Redis is unavailable the service degrades to an
 * equivalent in-memory store so the gateway keeps working locally.
 */
@Injectable()
export class PresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private readonly keyPrefix = 'presence:market:';
  private readonly redis: any | null;
  /** marketId → (userId → lastHeartbeat) used only when Redis is absent. */
  private readonly memory = new Map<string, Map<string, number>>();
  /** Every market id we have ever seen, so we can clean up on disconnect. */
  private readonly knownMarkets = new Set<string>();

  constructor(private readonly config: ConfigService) {
    this.redis = this.createRedisClient();
  }

  private createRedisClient(): any | null {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Redis = require('ioredis');
      const client = new Redis(url, { maxRetriesPerRequest: 2 });
      client.on('error', (err: Error) =>
        this.logger.warn(`Presence Redis error: ${err.message}`),
      );
      return client;
    } catch {
      this.logger.warn('ioredis unavailable — using in-memory presence store');
      return null;
    }
  }

  private key(marketId: string): string {
    return `${this.keyPrefix}${marketId}`;
  }

  /** Record a heartbeat for a user viewing a market. */
  async heartbeat(
    userId: string,
    marketId: string,
    now = Date.now(),
  ): Promise<void> {
    this.knownMarkets.add(marketId);

    if (this.redis) {
      const key = this.key(marketId);
      await this.redis.zadd(key, now, userId);
      // Keep the key alive while it keeps receiving heartbeats.
      await this.redis.expire(key, Math.ceil((PRESENCE_TTL_MS * 2) / 1000));
      return;
    }

    const members = this.memory.get(marketId) ?? new Map<string, number>();
    members.set(userId, now);
    this.memory.set(marketId, members);
  }

  /** Record a heartbeat for the same user across several markets at once. */
  async heartbeatForMarkets(
    userId: string,
    marketIds: string[],
    now = Date.now(),
  ): Promise<void> {
    for (const marketId of marketIds) {
      await this.heartbeat(userId, marketId, now);
    }
  }

  /** Number of active (non-expired) viewers for a market. */
  async getViewerCount(marketId: string, now = Date.now()): Promise<number> {
    const cutoff = now - PRESENCE_TTL_MS;
    if (this.redis) {
      const key = this.key(marketId);
      await this.redis.zremrangebyscore(key, '-inf', cutoff);
      return Number(await this.redis.zcard(key));
    }
    return this.pruneMemory(marketId, cutoff).size;
  }

  /** User identifiers of the active viewers for a market. */
  async getActiveViewers(
    marketId: string,
    now = Date.now(),
  ): Promise<string[]> {
    const cutoff = now - PRESENCE_TTL_MS;
    if (this.redis) {
      const key = this.key(marketId);
      await this.redis.zremrangebyscore(key, '-inf', cutoff);
      return (await this.redis.zrange(key, 0, -1)) as string[];
    }
    return [...this.pruneMemory(marketId, cutoff).keys()];
  }

  /** Total number of distinct online users across all tracked markets. */
  async getOnlineCount(now = Date.now()): Promise<number> {
    const cutoff = now - PRESENCE_TTL_MS;
    if (this.redis) {
      const unique = new Set<string>();
      for (const marketId of this.knownMarkets) {
        const key = this.key(marketId);
        await this.redis.zremrangebyscore(key, '-inf', cutoff);
        const members = (await this.redis.zrange(key, 0, -1)) as string[];
        members.forEach((m) => unique.add(m));
      }
      return unique.size;
    }

    const users = new Set<string>();
    for (const marketId of this.knownMarkets) {
      for (const userId of this.pruneMemory(marketId, cutoff).keys()) {
        users.add(userId);
      }
    }
    return users.size;
  }

  /** Remove a user from every market (called on socket disconnect). */
  async removeUser(userId: string): Promise<void> {
    if (this.redis) {
      await Promise.all(
        [...this.knownMarkets].map((marketId) =>
          this.redis.zrem(this.key(marketId), userId),
        ),
      );
      return;
    }
    for (const members of this.memory.values()) {
      members.delete(userId);
    }
  }

  /** Aggregate metrics exposed to operators / health checks. */
  async getMetrics(now = Date.now()): Promise<PresenceMetrics> {
    return {
      trackedMarkets: this.knownMarkets.size,
      onlineUsers: await this.getOnlineCount(now),
    };
  }

  private pruneMemory(marketId: string, cutoff: number): Map<string, number> {
    const members = this.memory.get(marketId);
    if (!members) return new Map();
    for (const [userId, ts] of members) {
      if (ts <= cutoff) members.delete(userId);
    }
    return members;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis?.quit) {
      await this.redis.quit().catch(() => undefined);
    }
  }
}
