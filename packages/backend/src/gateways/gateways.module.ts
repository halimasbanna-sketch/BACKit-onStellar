import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsGateway } from './events.gateway';
import { PresenceService } from './presence.service';

@Module({
  imports: [
    ConfigModule,
    /**
     * JwtModule is registered asynchronously so the secret is pulled from
     * ConfigService at runtime, identical to the AuthModule setup.
     */
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<any>('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  providers: [EventsGateway, PresenceService],
  // EventsGateway is exported so other modules can push notifications; the
  // PresenceService powers the GET /calls/:id/viewers endpoint.
  exports: [EventsGateway, PresenceService],
})
export class GatewaysModule {}
