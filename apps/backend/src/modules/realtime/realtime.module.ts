import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { RealtimeGateway } from './gateways/realtime.gateway';
import { PresenceService } from './services/presence.service';
import { RealtimeAuthService } from './services/realtime-auth.service';
import { RealtimeEmitterService } from './services/realtime-emitter.service';

@Module({
  imports: [AuthModule, ChatModule],
  providers: [
    RealtimeGateway,
    RealtimeAuthService,
    RealtimeEmitterService,
    PresenceService,
  ],
  exports: [RealtimeAuthService, RealtimeEmitterService, PresenceService],
})
export class RealtimeModule {}
