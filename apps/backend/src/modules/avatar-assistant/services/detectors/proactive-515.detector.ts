import { Injectable } from '@nestjs/common';
import type { AvatarAssistantMessageDto } from '@agentic-office/shared-types';
import { MicrosoftIntegrationsService } from '../../../integrations/microsoft/services/microsoft-integrations.service';
import { MicrosoftGraphMailService } from '../../../integrations/microsoft/services/microsoft-graph-mail.service';

export type AvatarAssistantMessageCandidate = Omit<
  AvatarAssistantMessageDto,
  'id' | 'generatedAt'
> & {
  dedupeKey: string;
};

const WEEKLY_REPORT_QUERY = '515 report';
const DEFAULT_TIMEZONE = 'America/Phoenix';

@Injectable()
export class Proactive515Detector {
  constructor(
    private readonly microsoftIntegrationsService: MicrosoftIntegrationsService,
    private readonly microsoftGraphMailService: MicrosoftGraphMailService,
  ) {}

  async detect(userId: string): Promise<AvatarAssistantMessageCandidate | null> {
    const now = new Date();
    const localParts = this.getLocalTimeParts(now, this.assistantTimezone());

    if (localParts.weekday !== 'fri' || localParts.hour < 15 || localParts.hour >= 18) {
      return null;
    }

    const accounts = await this.microsoftIntegrationsService.getAccountsForUser(userId);
    const account = accounts[0];
    if (!account) {
      return null;
    }

    const history = await this.microsoftGraphMailService.getWeeklyReportHistoryForUser({
      userId,
      accountEmail: account.accountEmail,
      query: WEEKLY_REPORT_QUERY,
      maxResults: 10,
    });

    const sentToday = history.emails.some((email) =>
      this.isSameLocalDate(email.sent_at, now, this.assistantTimezone()),
    );
    const dateKey = `${localParts.year}-${localParts.month}-${localParts.day}`;

    if (sentToday) {
      return {
        dedupeKey: `proactive_515:sent:${dateKey}`,
        kind: 'proactive_515',
        priority: 'info',
        title: 'Mini Me',
        body: 'Hey, good job sending that 515. I checked your recent sent mail and it looks like you already got it out today.',
        suggestedAction: null,
      };
    }

    return {
      dedupeKey: `proactive_515:reminder:${dateKey}`,
      kind: 'proactive_515',
      priority: 'important',
      title: 'Mini Me',
      body: "It's Friday afternoon and I don't think your 515 has gone out yet. Want me to help you draft it from this week's work?",
      suggestedAction: {
        type: 'open_weekly_report',
        label: 'Open 515 Generator',
      },
    };
  }

  private assistantTimezone() {
    return process.env.WEEKLY_REPORT_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  }

  private getLocalTimeParts(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));

    return {
      weekday: (values.get('weekday') || '').toLowerCase(),
      year: Number(values.get('year') || 0),
      month: Number(values.get('month') || 0),
      day: Number(values.get('day') || 0),
      hour: Number(values.get('hour') || 0),
    };
  }

  private isSameLocalDate(value: string | null, reference: Date, timeZone: string) {
    if (!value) {
      return false;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return false;
    }

    const first = this.getLocalTimeParts(parsed, timeZone);
    const second = this.getLocalTimeParts(reference, timeZone);

    return (
      first.year === second.year &&
      first.month === second.month &&
      first.day === second.day
    );
  }
}
