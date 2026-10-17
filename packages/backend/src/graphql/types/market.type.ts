import { ObjectType, Field, ID } from '@nestjs/graphql';

/**
 * Live odds update pushed over the `oddsChanged` GraphQL subscription whenever
 * a stake is added to a market's pool.
 */
@ObjectType()
export class OddsUpdate {
  @Field(() => ID)
  callId: string;

  @Field({ nullable: true })
  totalYesStake?: string;

  @Field({ nullable: true })
  totalNoStake?: string;

  @Field()
  updatedAt: string;
}

/**
 * Emitted over the `marketResolved` subscription when a market settles.
 */
@ObjectType()
export class MarketResolution {
  @Field(() => ID)
  callId: string;

  @Field({ nullable: true })
  outcome?: string;

  @Field()
  updatedAt: string;
}
