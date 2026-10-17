import { PubSubService } from './pubsub.service';

describe('PubSubService', () => {
  let pubsub: PubSubService;

  beforeEach(() => {
    pubsub = new PubSubService();
  });

  it('delivers published payloads to a matching async iterator', async () => {
    const iterator = pubsub.asyncIterator<{ value: number }>('odds.changed.1');
    const next = iterator.next();

    pubsub.publish('odds.changed.1', { value: 42 });

    await expect(next).resolves.toEqual({ value: { value: 42 }, done: false });
  });

  it('buffers payloads published before the consumer reads them', async () => {
    const iterator = pubsub.asyncIterator<number>('market.resolved.1');
    pubsub.publish('market.resolved.1', 1);
    pubsub.publish('market.resolved.1', 2);

    expect(await iterator.next()).toEqual({ value: 1, done: false });
    expect(await iterator.next()).toEqual({ value: 2, done: false });
  });

  it('routes indexer.StakeAdded to the per-call trigger', async () => {
    const iterator = pubsub.asyncIterator<any>('odds.changed.CALL1');
    const next = iterator.next();

    pubsub.onStakeAdded({ call_id: 'CALL1', poolTotals: {} });

    const result = await next;
    expect(result.value.callId).toBe('CALL1');
  });

  it('does not deliver to non-matching triggers', async () => {
    const iterator = pubsub.asyncIterator<number>('odds.changed.2');
    pubsub.publish('odds.changed.other', 99);

    // Following publish resolves the pending read.
    const pending = iterator.next();
    pubsub.publish('odds.changed.2', 7);
    await expect(pending).resolves.toEqual({ value: 7, done: false });
  });
});
