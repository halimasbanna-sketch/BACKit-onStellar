import { WebPushService } from './web-push.service';
import { PushSubscriptionEntity } from './push-subscription.entity';

describe('WebPushService', () => {
  let service: WebPushService;
  const repo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve({ id: 'sub-1', ...x })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => fallback),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WebPushService(repo as any, config as any);
  });

  it('creates a new subscription when none exists', async () => {
    repo.findOne.mockResolvedValue(null);

    await service.saveSubscription('GUSER', {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'pkey', auth: 'asecret' },
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'GUSER',
        endpoint: 'https://push.example/abc',
      }),
    );
    expect(repo.save).toHaveBeenCalled();
  });

  it('updates an existing subscription for the same endpoint', async () => {
    const existing: Partial<PushSubscriptionEntity> = {
      id: 'sub-1',
      endpoint: 'https://push.example/abc',
      userId: 'GOLD',
    };
    repo.findOne.mockResolvedValue(existing);

    await service.saveSubscription('GNEW', {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'new', auth: 'newauth' },
    });

    expect(existing.userId).toBe('GNEW');
    expect(existing.p256dh).toBe('new');
    expect(repo.save).toHaveBeenCalledWith(existing);
  });

  it('removes a subscription by endpoint', async () => {
    await service.removeSubscription('GUSER', 'https://push.example/abc');
    expect(repo.delete).toHaveBeenCalledWith({
      userId: 'GUSER',
      endpoint: 'https://push.example/abc',
    });
  });

  it('is a no-op when VAPID is not configured', async () => {
    repo.find.mockResolvedValue([{ id: 'sub-1' }]);
    const result = await service.sendToUser('GUSER', {
      title: 't',
      body: 'b',
    });
    expect(result).toEqual({ attempted: 1, delivered: 0, pruned: 0 });
  });
});
