import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { MicrosoftAccountDto } from '../dto/microsoft-account.dto';
import type { MicrosoftOauthCallbackResultDto } from '../dto/microsoft-oauth-callback-result.dto';
import type { MicrosoftOauthStartDto } from '../dto/microsoft-oauth-start.dto';
import { ExternalAccountsRepository } from '../repositories/external-accounts.repository';
import { OauthStatesRepository } from '../repositories/oauth-states.repository';
import { MicrosoftTokenCryptoService } from './microsoft-token-crypto.service';

const MICROSOFT_GRAPH_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'User.Read',
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send',
];

@Injectable()
export class MicrosoftIntegrationsService {
  constructor(
    private readonly externalAccountsRepository: ExternalAccountsRepository,
    private readonly oauthStatesRepository: OauthStatesRepository,
    private readonly microsoftTokenCryptoService: MicrosoftTokenCryptoService,
  ) {}

  async getAccountsForUser(userId: string): Promise<MicrosoftAccountDto[]> {
    const accounts = await this.externalAccountsRepository.findMicrosoftAccountsForUser(userId);
    return accounts.map((account) => ({
      id: account.id,
      provider: 'microsoft',
      accountEmail: account.providerAccountEmail,
      connectedAt: account.connectedAt.toISOString(),
      scopes: Array.isArray(account.scopes) ? account.scopes : [],
      tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
    }));
  }

  async startOauth(userId: string, redirectTo?: string): Promise<MicrosoftOauthStartDto> {
    const { clientId, redirectUri, tenantId } = this.microsoftOauthSettings();
    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10);

    await this.oauthStatesRepository.create({
      provider: 'microsoft',
      userId,
      state,
      redirectTo: redirectTo?.trim() || null,
      expiresAt,
    });

    const authorizationUrl = new URL(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    );
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('response_mode', 'query');
    authorizationUrl.searchParams.set('scope', MICROSOFT_GRAPH_SCOPES.join(' '));
    authorizationUrl.searchParams.set('state', state);

    return {
      authorizationUrl: authorizationUrl.toString(),
      state,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async finishOauth(
    state: string,
    code: string,
  ): Promise<MicrosoftOauthCallbackResultDto> {
    const oauthState = await this.oauthStatesRepository.consumeMicrosoftState(state);

    if (!oauthState) {
      throw new BadRequestException(
        'OAuth state is invalid or expired. Start the Microsoft connection flow again.',
      );
    }

    const tokenPayload = await this.exchangeCodeForTokens(code);
    const profile = await this.fetchMicrosoftProfile(tokenPayload.access_token);
    const accountEmail = this.normalizeMicrosoftEmail(profile);
    const scopes = this.normalizeScopes(tokenPayload.scope);
    const tokenExpiresAt = this.toTokenExpiresAt(tokenPayload.expires_in);
    const refreshToken = this.pickString(tokenPayload.refresh_token);

    const account = await this.externalAccountsRepository.upsertMicrosoftAccount({
      userId: oauthState.userId,
      providerAccountId: this.pickString(profile.id),
      providerAccountEmail: accountEmail,
      accessTokenEncrypted: this.microsoftTokenCryptoService.encrypt(
        tokenPayload.access_token,
      ),
      refreshTokenEncrypted: refreshToken
        ? this.microsoftTokenCryptoService.encrypt(refreshToken)
        : null,
      tokenExpiresAt,
      scopes,
    });

    return {
      account: {
        id: account.id,
        email: account.providerAccountEmail,
        connectedAt: account.connectedAt.toISOString(),
        scopes,
      },
      redirectTo: oauthState.redirectTo,
    };
  }

  private async exchangeCodeForTokens(code: string) {
    const { clientId, clientSecret, redirectUri, tenantId } = this.microsoftOauthSettings();
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: MICROSOFT_GRAPH_SCOPES.join(' '),
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new BadGatewayException(
        await this.extractMicrosoftErrorMessage(
          response,
          'Microsoft token exchange failed.',
        ),
      );
    }

    return (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
  }

  private async fetchMicrosoftProfile(accessToken: string) {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new BadGatewayException(
        await this.extractMicrosoftErrorMessage(
          response,
          'Microsoft profile lookup failed.',
        ),
      );
    }

    return (await response.json()) as {
      id?: unknown;
      mail?: unknown;
      userPrincipalName?: unknown;
    };
  }

  private normalizeMicrosoftEmail(profile: {
    mail?: unknown;
    userPrincipalName?: unknown;
  }) {
    const email = this.pickString(profile.mail) || this.pickString(profile.userPrincipalName);
    if (!email) {
      throw new BadGatewayException(
        'Microsoft account lookup did not return a usable email address.',
      );
    }

    return email.trim().toLowerCase();
  }

  private normalizeScopes(scope?: string) {
    if (!scope?.trim()) {
      return MICROSOFT_GRAPH_SCOPES;
    }

    return scope
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private toTokenExpiresAt(expiresIn?: number) {
    if (!expiresIn || Number.isNaN(expiresIn)) {
      return null;
    }

    return new Date(Date.now() + expiresIn * 1000);
  }

  private pickString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private async extractMicrosoftErrorMessage(response: Response, fallback: string) {
    try {
      const payload = (await response.json()) as {
        error_description?: unknown;
        error?: { message?: unknown };
      };
      if (
        typeof payload.error_description === 'string' &&
        payload.error_description.trim()
      ) {
        return payload.error_description.trim();
      }
      if (
        payload.error &&
        typeof payload.error === 'object' &&
        typeof payload.error.message === 'string' &&
        payload.error.message.trim()
      ) {
        return payload.error.message.trim();
      }
    } catch {}

    return fallback;
  }

  private microsoftOauthSettings() {
    const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI?.trim();
    const tenantId = process.env.MICROSOFT_TENANT_ID?.trim() || 'organizations';

    if (!clientId || !clientSecret || !redirectUri) {
      throw new InternalServerErrorException(
        'Microsoft OAuth is not configured on the backend.',
      );
    }

    return {
      clientId,
      clientSecret,
      redirectUri,
      tenantId,
    };
  }
}
