import { Injectable } from '@nestjs/common';
import type {
  AINewsDto,
  ApiEvent,
  ConnectedMicrosoftAccountDto,
  DatabaseStatusDto,
  HealthStatusDto,
  LinkedInPostDto,
  LinkedInPostRequestDto,
  WeeklyReportDraftDto,
  WeeklyReportDraftRequestDto,
  WeeklyReportHistoryDto,
  WeeklyReportReviseRequestDto,
  WeeklyReportSaveDraftDto,
  WeeklyReportSaveDraftRequestDto,
  WeeklyReportSendDto,
  WeeklyReportSendRequestDto,
} from '@agentic-office/shared-types';
import { DatabaseService } from './database/database.service';

@Injectable()
export class AppService {
  constructor(private readonly databaseService: DatabaseService) {}

  getHealth(): HealthStatusDto {
    return {
      status: 'ok',
      service: 'backend',
      timestamp: new Date().toISOString(),
    };
  }

  getDatabaseStatus(): DatabaseStatusDto {
    return this.databaseService.getStatus();
  }

  getSampleEvent(): ApiEvent {
    return {
      id: 'evt_backend_ready',
      type: 'backend.ready',
      payload: {
        message: 'NestJS backend is running',
      },
      createdAt: new Date().toISOString(),
    };
  }

  async getNewsstandItem(): Promise<AINewsDto> {
    const aiServiceUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8001';
    const response = await fetch(`${aiServiceUrl}/agents/ai-news`);

    if (!response.ok) {
      throw new Error(`AI service request failed with status ${response.status}.`);
    }

    return (await response.json()) as AINewsDto;
  }

  async createLinkedInPost(
    payload: LinkedInPostRequestDto,
  ): Promise<LinkedInPostDto> {
    const response = await this.requestAiService('/agents/linkedin-post', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return (await response.json()) as LinkedInPostDto;
  }

  async createWeeklyReportDraft(
    payload: WeeklyReportDraftRequestDto,
  ): Promise<WeeklyReportDraftDto> {
    const response = await this.requestAiService('/agents/weekly-report/draft', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return (await response.json()) as WeeklyReportDraftDto;
  }

  async getConnectedWeeklyReportAccounts(): Promise<ConnectedMicrosoftAccountDto[]> {
    const response = await this.requestAiService('/agents/weekly-report/microsoft/accounts');
    return (await response.json()) as ConnectedMicrosoftAccountDto[];
  }

  async getWeeklyReportHistory(input: {
    accountEmail: string;
    query?: string;
    maxResults?: string;
  }): Promise<WeeklyReportHistoryDto> {
    const params = new URLSearchParams({
      account_email: input.accountEmail,
    });

    if (input.query) {
      params.set('query', input.query);
    }

    if (input.maxResults) {
      params.set('max_results', input.maxResults);
    }

    const response = await this.requestAiService(
      `/agents/weekly-report/history?${params.toString()}`,
    );

    return (await response.json()) as WeeklyReportHistoryDto;
  }

  async reviseWeeklyReportDraft(
    payload: WeeklyReportReviseRequestDto,
  ): Promise<WeeklyReportDraftDto> {
    const response = await this.requestAiService('/agents/weekly-report/revise', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return (await response.json()) as WeeklyReportDraftDto;
  }

  async saveWeeklyReportDraft(
    payload: WeeklyReportSaveDraftRequestDto,
  ): Promise<WeeklyReportSaveDraftDto> {
    const response = await this.requestAiService('/agents/weekly-report/save-draft', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return (await response.json()) as WeeklyReportSaveDraftDto;
  }

  async sendWeeklyReport(
    payload: WeeklyReportSendRequestDto,
  ): Promise<WeeklyReportSendDto> {
    const response = await this.requestAiService('/agents/weekly-report/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return (await response.json()) as WeeklyReportSendDto;
  }

  private async requestAiService(path: string, init?: RequestInit): Promise<Response> {
    const aiServiceUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8001';
    const response = await fetch(`${aiServiceUrl}${path}`, init);

    if (!response.ok) {
      throw new Error(await this.extractAiServiceError(response));
    }

    return response;
  }

  private async extractAiServiceError(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        return payload.detail;
      }
    } catch {
      // Fall back to the HTTP status message below when the response is not JSON.
    }

    return `AI service request failed with status ${response.status}.`;
  }
}
