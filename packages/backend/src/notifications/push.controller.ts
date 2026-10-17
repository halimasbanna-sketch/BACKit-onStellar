import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WebPushService } from './web-push.service';

export class PushKeysDto {
  p256dh: string;
  auth: string;
}

export class SubscribePushDto {
  endpoint: string;
  keys: PushKeysDto;
  expirationTime?: number | null;
}

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('notifications/push')
export class PushController {
  constructor(private readonly webPush: WebPushService) {}

  @Get('public-key')
  @ApiOperation({ summary: 'Get the VAPID public key for push registration' })
  getPublicKey() {
    return { publicKey: this.webPush.getPublicKey() };
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a browser push subscription' })
  async subscribe(
    @CurrentUser() userAddress: string,
    @Body() dto: SubscribePushDto,
  ) {
    if (!dto?.endpoint || !dto.keys?.p256dh || !dto.keys?.auth) {
      throw new BadRequestException(
        'endpoint and keys.p256dh/keys.auth are required',
      );
    }
    const saved = await this.webPush.saveSubscription(userAddress, dto);
    return { id: saved.id, endpoint: saved.endpoint };
  }

  @Delete('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiQuery({ name: 'endpoint', required: true })
  @ApiOperation({ summary: 'Remove a browser push subscription' })
  async unsubscribe(
    @CurrentUser() userAddress: string,
    @Query('endpoint') endpoint: string,
  ): Promise<void> {
    if (!endpoint) throw new BadRequestException('endpoint is required');
    await this.webPush.removeSubscription(userAddress, endpoint);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test push notification to all devices' })
  async test(@CurrentUser() userAddress: string) {
    return this.webPush.sendToUser(userAddress, {
      title: 'BACKit',
      body: 'Test push notification',
      url: '/',
    });
  }
}
