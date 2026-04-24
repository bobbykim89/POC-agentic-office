import {
  Controller,
  Get,
  Query,
  Redirect,
  UnauthorizedException,
} from '@nestjs/common';
import type { ApiSuccessResponse } from '../../../../common/interfaces/api-response.interface';
import { toApiSuccessResponse } from '../../../../common/interfaces/api-response.interface';
import { Public } from '../../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { MicrosoftOauthCallbackQueryDto } from '../dto/microsoft-oauth-callback-query.dto';
import type { MicrosoftAccountDto } from '../dto/microsoft-account.dto';
import type { MicrosoftOauthCallbackResultDto } from '../dto/microsoft-oauth-callback-result.dto';
import type { MicrosoftOauthStartDto } from '../dto/microsoft-oauth-start.dto';
import { MicrosoftOauthStartQueryDto } from '../dto/microsoft-oauth-start-query.dto';
import { MicrosoftIntegrationsService } from '../services/microsoft-integrations.service';

@Controller('integrations/microsoft')
export class MicrosoftIntegrationsController {
  constructor(
    private readonly microsoftIntegrationsService: MicrosoftIntegrationsService,
  ) {}

  @Get('accounts')
  async getAccounts(
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<ApiSuccessResponse<MicrosoftAccountDto[]>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return toApiSuccessResponse(
      await this.microsoftIntegrationsService.getAccountsForUser(user.userId),
    );
  }

  @Get('oauth/start')
  async startOauth(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: MicrosoftOauthStartQueryDto,
  ): Promise<ApiSuccessResponse<MicrosoftOauthStartDto>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return toApiSuccessResponse(
      await this.microsoftIntegrationsService.startOauth(user.userId, query.redirectTo),
    );
  }

  @Public()
  @Get('oauth/callback')
  @Redirect()
  async finishOauth(
    @Query() query: MicrosoftOauthCallbackQueryDto,
  ): Promise<{ url: string; statusCode?: number }> {
    try {
      const result = await this.microsoftIntegrationsService.finishOauth(
        query.state,
        query.code,
      );

      return {
        url: this.buildRedirectUrl(result.redirectTo, {
          microsoft: 'connected',
          account: result.account.email,
          open: 'weekly-report',
        }),
        statusCode: 302,
      };
    } catch (error) {
      return {
        url: this.buildRedirectUrl(undefined, {
          microsoft: 'error',
          message:
            error instanceof Error && error.message.trim()
              ? error.message
              : 'Microsoft connection failed.',
          open: 'weekly-report',
        }),
        statusCode: 302,
      };
    }
  }

  private buildRedirectUrl(
    redirectTo: string | null | undefined,
    params: Record<string, string>,
  ) {
    const fallback =
      process.env.CLIENT_APP_URL?.trim() ||
      process.env.CORS_ALLOWED_ORIGIN?.trim() ||
      'http://localhost:5000';
    const url = new URL(redirectTo?.trim() || fallback);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    return url.toString();
  }
}
