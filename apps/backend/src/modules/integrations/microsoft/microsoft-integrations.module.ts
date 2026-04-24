import { Module } from '@nestjs/common';
import { MicrosoftIntegrationsController } from './controllers/microsoft-integrations.controller';
import { ExternalAccountsRepository } from './repositories/external-accounts.repository';
import { OauthStatesRepository } from './repositories/oauth-states.repository';
import { MicrosoftIntegrationsService } from './services/microsoft-integrations.service';
import { MicrosoftGraphMailService } from './services/microsoft-graph-mail.service';
import { MicrosoftTokenCryptoService } from './services/microsoft-token-crypto.service';

@Module({
  controllers: [MicrosoftIntegrationsController],
  providers: [
    MicrosoftIntegrationsService,
    MicrosoftGraphMailService,
    MicrosoftTokenCryptoService,
    ExternalAccountsRepository,
    OauthStatesRepository,
  ],
  exports: [MicrosoftIntegrationsService, MicrosoftGraphMailService],
})
export class MicrosoftIntegrationsModule {}
