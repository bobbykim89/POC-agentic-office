import { Module } from '@nestjs/common';
import { MicrosoftIntegrationsModule } from '../integrations/microsoft/microsoft-integrations.module';
import { AvatarAssistantController } from './controllers/avatar-assistant.controller';
import { AssistantNotificationsRepository } from './repositories/assistant-notifications.repository';
import { AvatarAssistantService } from './services/avatar-assistant.service';
import { Proactive515Detector } from './services/detectors/proactive-515.detector';

@Module({
  imports: [MicrosoftIntegrationsModule],
  controllers: [AvatarAssistantController],
  providers: [
    AvatarAssistantService,
    AssistantNotificationsRepository,
    Proactive515Detector,
  ],
})
export class AvatarAssistantModule {}
