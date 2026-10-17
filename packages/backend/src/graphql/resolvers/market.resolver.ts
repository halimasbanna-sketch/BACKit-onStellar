import {
  Resolver,
  Query,
  Subscription,
  Args,
  ID,
} from '@nestjs/graphql';
import { CallsService } from '../../calls/calls.service';
import { PubSubService } from '../pubsub.service';
import { CallType } from '../types/call.type';
import { OddsUpdate, MarketResolution } from '../types/market.type';

/**
 * Real-time market resolvers.
 *
 * - `call(callId)` — fetch a single call (DataLoader-friendly, nested fields
 *   are resolved by `CallsResolver`).
 * - `oddsChanged(callId)` — subscription: fires on every stake added to a
 *   market's pool.
 * - `marketResolved(callId)` — subscription: fires when the market settles.
 */
@Resolver()
export class MarketResolver {
  constructor(
    private readonly callsService: CallsService,
    private readonly pubsub: PubSubService,
  ) {}

  @Query(() => CallType, {
    name: 'call',
    nullable: true,
    description: 'Fetch a single prediction call by id',
  })
  async getCall(@Args('callId', { type: () => ID }) callId: string) {
    return (await this.callsService.getCallOrThrow(callId)) as unknown as CallType;
  }

  @Subscription(() => OddsUpdate, {
    name: 'oddsChanged',
    description: 'Live odds updates for a market as stakes are placed',
    filter: (payload: OddsUpdate, variables: { callId: string }) =>
      payload.callId === variables.callId,
  })
  oddsChanged(
    @Args('callId', { type: () => ID }) callId: string,
  ): AsyncIterableIterator<OddsUpdate> {
    return this.pubsub.asyncIterator<OddsUpdate>(`odds.changed.${callId}`);
  }

  @Subscription(() => MarketResolution, {
    name: 'marketResolved',
    description: 'Emitted when a market is resolved',
    filter: (payload: MarketResolution, variables: { callId: string }) =>
      payload.callId === variables.callId,
  })
  marketResolved(
    @Args('callId', { type: () => ID }) callId: string,
  ): AsyncIterableIterator<MarketResolution> {
    return this.pubsub.asyncIterator<MarketResolution>(
      `market.resolved.${callId}`,
    );
  }
}
