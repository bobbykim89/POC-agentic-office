import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MicrosoftIntegrationsModule } from '../integrations/microsoft/microsoft-integrations.module';
import { AgentBridgeController } from './controllers/agent-bridge.controller';
import { AgentBridgeLogsRepository } from './repositories/agent-logs.repository';
import { AgentBridgeService } from './services/agent-bridge.service';
import { FastapiClientService } from './services/fastapi-client.service';

@Module({
  imports: [MicrosoftIntegrationsModule, UsersModule],
  controllers: [AgentBridgeController],
  providers: [AgentBridgeService, FastapiClientService, AgentBridgeLogsRepository],
  exports: [AgentBridgeService, FastapiClientService],
})
export class AgentBridgeModule {}
