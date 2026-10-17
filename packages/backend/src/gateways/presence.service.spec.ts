import { PresenceService, PRESENCE_TTL_MS } from './presence.service';

describe('PresenceService (in-memory store)', () => {
  let service: PresenceService;
  const config = { get: jest.fn().mockReturnValue(undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PresenceService(config as any);
  });

  it('counts a viewer after a heartbeat', async () => {
    const now = 1_000_000;
    await service.heartbeat('GUSER1', 'market-1', now);
    await service.heartbeat('GUSER2', 'market-1', now);

    expect(await service.getViewerCount('market-1', now)).toBe(2);
  });

  it('expires viewers after the 60s TTL', async () => {
    const now = 1_000_000;
    await service.heartbeat('GUSER', 'market-1', now);

    expect(await service.getViewerCount('market-1', now + 1)).toBe(1);
    expect(
      await service.getViewerCount('market-1', now + PRESENCE_TTL_MS + 1),
    ).toBe(0);
  });

  it('returns active viewer identifiers', async () => {
    const now = Date.now();
    await service.heartbeat('GUSER1', 'market-1', now);
    await service.heartbeat('GUSER2', 'market-2', now);

    const viewers = await service.getActiveViewers('market-1', now);
    expect(viewers).toContain('GUSER1');
  });

  it('removes a user from all markets on disconnect', async () => {
    const now = Date.now();
    await service.heartbeat('GUSER', 'market-1', now);
    await service.heartbeat('GUSER', 'market-2', now);

    await service.removeUser('GUSER');

    expect(await service.getViewerCount('market-1', now)).toBe(0);
    expect(await service.getViewerCount('market-2', now)).toBe(0);
  });

  it('aggregates online users across markets without double counting', async () => {
    const now = Date.now();
    await service.heartbeat('GUSER', 'market-1', now);
    await service.heartbeat('GUSER', 'market-2', now);
    await service.heartbeat('GOTHER', 'market-2', now);

    expect(await service.getOnlineCount(now)).toBe(2);
  });

  it('expires stale heartbeats on read', async () => {
    const now = Date.now();
    await service.heartbeat('GUSER', 'market-1', now);

    const count = await service.getViewerCount('market-1', now + PRESENCE_TTL_MS + 1);
    expect(count).toBe(0);

    const metrics = await service.getMetrics(now + PRESENCE_TTL_MS + 1);
    expect(metrics.onlineUsers).toBe(0);
  });
});
