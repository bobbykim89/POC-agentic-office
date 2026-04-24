import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import type {
  WeeklyReportDraftDto,
  WeeklyReportHistoryDto,
  WeeklyReportMessageDto,
  WeeklyReportSaveDraftDto,
  WeeklyReportSendDto,
} from '@agentic-office/shared-types';
import { ExternalAccountsRepository } from '../repositories/external-accounts.repository';
import { MicrosoftTokenCryptoService } from './microsoft-token-crypto.service';

const DEFAULT_WEEKLY_REPORT_SUBJECT_QUERY = '515 report';
const DEFAULT_WEEKLY_REPORT_MAX_RESULTS = 6;
const DEFAULT_WEEKLY_REPORT_DAYS_BACK = 30;
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
export class MicrosoftGraphMailService {
  constructor(
    private readonly externalAccountsRepository: ExternalAccountsRepository,
    private readonly microsoftTokenCryptoService: MicrosoftTokenCryptoService,
  ) {}

  async getWeeklyReportHistoryForUser(input: {
    userId: string;
    accountEmail: string;
    query?: string;
    maxResults?: number;
  }): Promise<WeeklyReportHistoryDto> {
    const account = await this.requireMicrosoftAccount(input.userId, input.accountEmail);
    const accessToken = await this.getValidAccessToken(account);
    const subjectQuery = (input.query || this.weeklyReportSubjectQuery()).trim();
    const maxResults = Math.max(
      1,
      Math.min(input.maxResults ?? DEFAULT_WEEKLY_REPORT_MAX_RESULTS, 10),
    );

    const response = await this.graphRequest({
      method: 'GET',
      path: '/me/mailFolders/sentitems/messages',
      accessToken,
      params: {
        $top: '25',
        $orderby: 'sentDateTime DESC',
        $select:
          'id,conversationId,subject,sentDateTime,bodyPreview,body,toRecipients,ccRecipients',
      },
    });

    const rawMessages = Array.isArray(response.value)
      ? (response.value as Record<string, unknown>[])
      : [];

    const emails = rawMessages
      .filter(
        (message) =>
          this.messageMatchesSubjectQuery(message.subject, subjectQuery) &&
          this.messageWithinDays(message.sentDateTime, this.weeklyReportDaysBack()),
      )
      .map((message) => this.parseGraphMessage(message))
      .slice(0, maxResults);

    return {
      account_email: account.providerAccountEmail,
      query: subjectQuery,
      emails,
      last_week_email: this.selectLastWeekEmail(emails),
    };
  }

  async saveWeeklyReportDraftForUser(input: {
    userId: string;
    accountEmail: string;
    recipient: string;
    subject: string;
    body: string;
    bodyHtml?: string | null;
  }): Promise<WeeklyReportSaveDraftDto> {
    const account = await this.requireMicrosoftAccount(input.userId, input.accountEmail);
    const accessToken = await this.getValidAccessToken(account);
    const recipient = input.recipient.trim();
    const subject = input.subject.trim();
    const body = input.body.trim();

    if (!recipient) {
      throw new BadRequestException('Provide a recipient email before saving a draft.');
    }
    if (!subject) {
      throw new BadRequestException('Provide a subject before saving a draft.');
    }
    if (!body) {
      throw new BadRequestException('Provide a body before saving a draft.');
    }

    const response = await this.graphRequest({
      method: 'POST',
      path: '/me/messages',
      accessToken,
      jsonBody: this.buildGraphMessagePayload({
        recipient,
        subject,
        body,
        bodyHtml: input.bodyHtml,
      }),
    });

    return {
      account_email: account.providerAccountEmail,
      recipient,
      subject,
      graph_message_id: String(response.id ?? ''),
      graph_conversation_id:
        typeof response.conversationId === 'string' ? response.conversationId : null,
    };
  }

  async sendWeeklyReportForUser(input: {
    userId: string;
    accountEmail: string;
    recipient: string;
    subject: string;
    body: string;
    bodyHtml?: string | null;
    confirmSend: boolean;
  }): Promise<WeeklyReportSendDto> {
    if (!input.confirmSend) {
      throw new BadRequestException(
        'Explicit confirmation is required before sending the email.',
      );
    }

    const draft = await this.saveWeeklyReportDraftForUser({
      userId: input.userId,
      accountEmail: input.accountEmail,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      bodyHtml: input.bodyHtml,
    });

    const account = await this.requireMicrosoftAccount(input.userId, input.accountEmail);
    const accessToken = await this.getValidAccessToken(account);
    await this.graphRequest({
      method: 'POST',
      path: `/me/messages/${draft.graph_message_id}/send`,
      accessToken,
    });

    return {
      account_email: draft.account_email,
      recipient: draft.recipient,
      subject: draft.subject,
      graph_message_id: draft.graph_message_id,
      graph_conversation_id: draft.graph_conversation_id,
    };
  }

  private async requireMicrosoftAccount(userId: string, accountEmail: string) {
    const normalizedEmail = accountEmail.trim().toLowerCase();
    const account =
      await this.externalAccountsRepository.findMicrosoftAccountByEmailForUser(
        userId,
        normalizedEmail,
      );

    if (!account) {
      throw new BadRequestException(
        `No connected Microsoft account found for ${normalizedEmail}.`,
      );
    }

    return account;
  }

  private async getValidAccessToken(account: {
    id: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
  }) {
    if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() > Date.now() + 60_000) {
      await this.externalAccountsRepository.touchLastUsedAt(account.id);
      return this.microsoftTokenCryptoService.decrypt(account.accessTokenEncrypted);
    }

    if (!account.refreshTokenEncrypted) {
      throw new BadRequestException(
        'Microsoft credentials for this account cannot be refreshed. Reconnect the account.',
      );
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
    const tenantId = process.env.MICROSOFT_TENANT_ID?.trim() || 'organizations';
    if (!clientId || !clientSecret) {
      throw new BadGatewayException('Microsoft OAuth is not configured on the backend.');
    }

    const refreshToken = this.microsoftTokenCryptoService.decrypt(
      account.refreshTokenEncrypted,
    );
    const response = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          scope: MICROSOFT_GRAPH_SCOPES.join(' '),
        }).toString(),
      },
    );

    if (!response.ok) {
      throw new BadGatewayException(
        await this.extractMicrosoftErrorMessage(
          response,
          'Microsoft token refresh failed.',
        ),
      );
    }

    const payload = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const nextRefreshToken = payload.refresh_token?.trim() || refreshToken;
    const tokenExpiresAt =
      payload.expires_in && !Number.isNaN(payload.expires_in)
        ? new Date(Date.now() + Math.max(payload.expires_in - 120, 60) * 1000)
        : null;

    await this.externalAccountsRepository.updateMicrosoftTokens({
      accountId: account.id,
      accessTokenEncrypted: this.microsoftTokenCryptoService.encrypt(payload.access_token),
      refreshTokenEncrypted: nextRefreshToken
        ? this.microsoftTokenCryptoService.encrypt(nextRefreshToken)
        : null,
      tokenExpiresAt,
    });

    return payload.access_token;
  }

  private async graphRequest(input: {
    method: 'GET' | 'POST';
    path: string;
    accessToken: string;
    params?: Record<string, string>;
    jsonBody?: Record<string, unknown>;
  }) {
    const url = new URL(`https://graph.microsoft.com/v1.0${input.path}`);
    if (input.params) {
      for (const [key, value] of Object.entries(input.params)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: input.jsonBody ? JSON.stringify(input.jsonBody) : undefined,
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `Microsoft Graph request failed: ${await this.extractMicrosoftErrorMessage(
          response,
          'Unknown Microsoft Graph error.',
        )}`,
      );
    }

    const text = await response.text();
    if (!text.trim()) {
      return {};
    }

    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private parseGraphMessage(message: Record<string, unknown>): WeeklyReportMessageDto {
    return {
      message_id: String(message.id ?? ''),
      thread_id:
        typeof message.conversationId === 'string' ? message.conversationId : null,
      subject: String(message.subject ?? '').trim(),
      sent_at: typeof message.sentDateTime === 'string' ? message.sentDateTime : null,
      to: this.graphRecipientsToList(message.toRecipients),
      cc: this.graphRecipientsToList(message.ccRecipients),
      snippet: String(message.bodyPreview ?? '').trim(),
      body_text: this.graphBodyToText(message.body),
      body_html: this.graphBodyToHtml(message.body),
    };
  }

  private graphRecipientsToList(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((recipient) => {
        if (!recipient || typeof recipient !== 'object') {
          return null;
        }
        const emailAddress =
          'emailAddress' in recipient &&
          recipient.emailAddress &&
          typeof recipient.emailAddress === 'object'
            ? recipient.emailAddress
            : null;
        const address =
          emailAddress && 'address' in emailAddress
            ? emailAddress.address
            : null;
        return typeof address === 'string' && address.trim() ? address.trim() : null;
      })
      .filter((item): item is string => Boolean(item));
  }

  private graphBodyToText(body: unknown) {
    if (!body || typeof body !== 'object') {
      return '';
    }

    const content = 'content' in body ? String(body.content ?? '') : '';
    const contentType =
      'contentType' in body ? String(body.contentType ?? '').toLowerCase() : '';
    if (contentType === 'html') {
      return content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return content.replace(/\s+/g, ' ').trim();
  }

  private graphBodyToHtml(body: unknown) {
    if (!body || typeof body !== 'object') {
      return '';
    }

    const content = 'content' in body ? String(body.content ?? '').trim() : '';
    const contentType =
      'contentType' in body ? String(body.contentType ?? '').toLowerCase() : '';
    if (contentType === 'html') {
      return content;
    }
    if (!content) {
      return '';
    }

    return this.plainTextToHtml(content);
  }

  private messageMatchesSubjectQuery(subject: unknown, query: string) {
    const normalizedSubject = String(subject ?? '').toLowerCase();
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) {
      return true;
    }

    const requiredTerms = normalizedQuery.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    return requiredTerms.every((term) => normalizedSubject.includes(term));
  }

  private messageWithinDays(sentAt: unknown, daysBack: number) {
    if (typeof sentAt !== 'string' || !sentAt) {
      return false;
    }

    const parsed = new Date(sentAt);
    if (Number.isNaN(parsed.getTime())) {
      return false;
    }

    return parsed.getTime() >= Date.now() - daysBack * 24 * 60 * 60 * 1000;
  }

  private selectLastWeekEmail(emails: WeeklyReportMessageDto[]) {
    if (emails.length === 0) {
      return null;
    }

    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    for (const email of emails) {
      if (!email.sent_at) {
        continue;
      }
      const parsed = new Date(email.sent_at);
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() >= cutoff) {
        return email;
      }
    }

    return emails[0];
  }

  private plainTextToHtml(text: string) {
    const escaped = text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

    return escaped
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${line}</p>`)
      .join('');
  }

  private buildGraphMessagePayload(input: {
    recipient: string;
    subject: string;
    body: string;
    bodyHtml?: string | null;
  }) {
    const htmlContent = input.bodyHtml?.trim() || this.plainTextToHtml(input.body);

    return {
      subject: input.subject,
      body: {
        contentType: 'HTML',
        content: htmlContent,
      },
      toRecipients: [
        {
          emailAddress: {
            address: input.recipient,
          },
        },
      ],
    };
  }

  private weeklyReportSubjectQuery() {
    return (
      process.env.WEEKLY_REPORT_SUBJECT_QUERY?.trim() ||
      DEFAULT_WEEKLY_REPORT_SUBJECT_QUERY
    );
  }

  private weeklyReportDaysBack() {
    const rawValue = process.env.WEEKLY_REPORT_LOOKBACK_DAYS?.trim();
    if (!rawValue) {
      return DEFAULT_WEEKLY_REPORT_DAYS_BACK;
    }

    const parsed = Number(rawValue);
    if (Number.isNaN(parsed)) {
      return DEFAULT_WEEKLY_REPORT_DAYS_BACK;
    }

    return Math.max(1, parsed);
  }

  private async extractMicrosoftErrorMessage(response: Response, fallback: string) {
    try {
      const payload = (await response.json()) as {
        error_description?: unknown;
        error?: { message?: unknown; code?: unknown } | unknown;
      };
      if (
        typeof payload.error_description === 'string' &&
        payload.error_description.trim()
      ) {
        return payload.error_description.trim();
      }

      if (payload.error && typeof payload.error === 'object') {
        const maybeMessage =
          'message' in payload.error ? payload.error.message : undefined;
        const maybeCode = 'code' in payload.error ? payload.error.code : undefined;
        if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
          return maybeMessage.trim();
        }
        if (typeof maybeCode === 'string' && maybeCode.trim()) {
          return maybeCode.trim();
        }
      }
    } catch {}

    return fallback;
  }
}
