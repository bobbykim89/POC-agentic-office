import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AgentBridgeModule } from './modules/agent-bridge/agent-bridge.module';
import { AvatarAssistantModule } from './modules/avatar-assistant/avatar-assistant.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { HealthModule } from './modules/health/health.module';
import { LogsModule } from './modules/logs/logs.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { MicrosoftIntegrationsModule } from './modules/integrations/microsoft/microsoft-integrations.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    AuthModule,
    AvatarAssistantModule,
    UsersModule,
    RoomsModule,
    ChatModule,
    RealtimeModule,
    AgentBridgeModule,
    MicrosoftIntegrationsModule,
    LogsModule,
  ],
})
export class AppModule {}
