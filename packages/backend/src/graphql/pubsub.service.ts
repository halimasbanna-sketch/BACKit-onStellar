import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

type Listener<T> = (payload: T) => void;

/**
 * Minimal in-process pub/sub used to drive GraphQL subscriptions.
 *
 * Kept dependency-free (no `graphql-subscriptions`) so it works in the same
 * event loop as the gateway. In a multi-instance deployment the `publish`
 * calls would fan out through Redis.
 */
@Injectable()
export class PubSubService {
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();

  publish<T>(trigger: string, payload: T): void {
    const set = this.listeners.get(trigger);
    if (!set) return;
    for (const listener of set) {
      listener(payload);
    }
  }

  asyncIterator<T>(triggers: string | string[]): AsyncIterableIterator<T> {
    const keys = Array.isArray(triggers) ? triggers : [triggers];
    const queue: T[] = [];
    let resolveNext: ((value: IteratorResult<T>) => void) | null = null;
    let done = false;

    const push = (payload: T) => {
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve({ value: payload, done: false });
      } else {
        queue.push(payload);
      }
    };

    const listener = push as Listener<unknown>;
    for (const key of keys) {
      const set = this.listeners.get(key) ?? new Set<Listener<unknown>>();
      set.add(listener);
      this.listeners.set(key, set);
    }

    const cleanup = () => {
      if (done) return;
      done = true;
      for (const key of keys) {
        this.listeners.get(key)?.delete(listener);
      }
      resolveNext?.({ value: undefined as unknown as T, done: true });
    };

    const iterator: AsyncIterableIterator<T> = {
      next: () => {
        if (queue.length > 0) {
          return Promise.resolve({ value: queue.shift() as T, done: false });
        }
        if (done) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          resolveNext = resolve;
        });
      },
      return: () => {
        cleanup();
        return Promise.resolve({ value: undefined as unknown as T, done: true });
      },
      throw: (err?: unknown) => {
        cleanup();
        return Promise.reject(err);
      },
      [Symbol.asyncIterator]() {
        return iterator;
      },
    };

    return iterator;
  }

  /** Bridge internal indexer events to GraphQL subscription triggers. */
  @OnEvent('indexer.StakeAdded')
  onStakeAdded(payload: { call_id: string; [key: string]: unknown }): void {
    if (!payload?.call_id) return;
    this.publish(`odds.changed.${payload.call_id}`, {
      callId: payload.call_id,
      ...payload,
      updatedAt: new Date().toISOString(),
    });
  }

  @OnEvent('indexer.CallResolved')
  onCallResolved(payload: { call_id: string; [key: string]: unknown }): void {
    if (!payload?.call_id) return;
    this.publish(`market.resolved.${payload.call_id}`, {
      callId: payload.call_id,
      ...payload,
      updatedAt: new Date().toISOString(),
    });
  }
}
