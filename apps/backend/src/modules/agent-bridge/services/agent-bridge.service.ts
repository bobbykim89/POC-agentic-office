import { BadGatewayException, NotFoundException, Injectable } from '@nestjs/common';
import type {
  AINewsDto,
  ConnectedMicrosoftAccountDto,
  LinkedInPostDto,
  LinkedInPostRequestDto,
  WeeklyReportDraftDto,
  WeeklyReportDraftRequestDto,
  WeeklyReportHistoryDto,
  WeeklyReportReviseRequestDto,
  WeeklyReportSaveDraftRequestDto,
  WeeklyReportSaveDraftDto,
  WeeklyReportSendRequestDto,
  WeeklyReportSendDto,
} from '@agentic-office/shared-types';
import type { MicrosoftAuthStartDto } from '../dto/microsoft-auth-start.dto';
import type {
  SpriteSheetRequestDto,
  SpriteSheetUploadInput,
} from '../dto/sprite-sheet-request.dto';
import { FastapiClientService } from './fastapi-client.service';
import type { SpriteSheetResponseDto } from '../dto/sprite-sheet-response.dto';
import { MicrosoftGraphMailService } from '../../integrations/microsoft/services/microsoft-graph-mail.service';
import { UsersRepository } from '../../users/repositories/users.repository';
import type { SpriteSheetGenerationResultDto } from '../dto/sprite-sheet-generation-result.dto';

@Injectable()
export class AgentBridgeService {
  constructor(
    private readonly fastapiClientService: FastapiClientService,
    private readonly microsoftGraphMailService: MicrosoftGraphMailService,
    private readonly usersRepository: UsersRepository,
  ) {}

  createLinkedinPost(
    payload: LinkedInPostRequestDto,
  ): Promise<LinkedInPostDto> {
    return this.fastapiClientService.createLinkedinPost(payload);
  }

  createSpriteSheet(
    payload: SpriteSheetUploadInput,
  ): Promise<SpriteSheetResponseDto> {
    return this.fastapiClientService.createSpriteSheet(payload);
  }

  async createSpriteSheetForUser(
    userId: string,
    payload: SpriteSheetUploadInput,
  ): Promise<SpriteSheetGenerationResultDto> {
    const hasDescription = Boolean(payload.description?.trim())
    const hasImage = Boolean(payload.imageBuffer?.length)

    if (hasDescription === hasImage) {
      throw new BadGatewayException(
        'Provide either a description or an image for sprite generation.',
      )
    }

    const sprite = await this.fastapiClientService.createSpriteSheet(payload);
    const spriteSheetUrl = this.extractCloudinarySpriteUrl(sprite);
    const user = await this.usersRepository.updateSpriteSheetUrl(userId, spriteSheetUrl);

    if (!user) {
      throw new NotFoundException('Authenticated user was not found.');
    }

    return {
      spriteSheetUrl,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        spriteSheetUrl: user.spriteSheetUrl,
      },
      sprite,
    };
  }

  getAiNews(): Promise<AINewsDto> {
    return this.fastapiClientService.getAiNews();
  }

  startWeeklyReportMicrosoftAuth(): Promise<MicrosoftAuthStartDto> {
    return this.fastapiClientService.startWeeklyReportMicrosoftAuth();
  }

  finishWeeklyReportMicrosoftAuth(query: {
    state: string;
    code: string;
  }): Promise<ConnectedMicrosoftAccountDto> {
    return this.fastapiClientService.finishWeeklyReportMicrosoftAuth(query);
  }

  getWeeklyReportMicrosoftAccounts(): Promise<ConnectedMicrosoftAccountDto[]> {
    return this.fastapiClientService.getWeeklyReportMicrosoftAccounts();
  }

  getWeeklyReportHistory(
    query: {
      account_email: string;
      query?: string;
      max_results?: number;
    },
  ): Promise<WeeklyReportHistoryDto> {
    return this.fastapiClientService.getWeeklyReportHistory(query);
  }

  getWeeklyReportHistoryForUser(
    userId: string,
    query: {
      account_email: string;
      query?: string;
      max_results?: number;
    },
  ): Promise<WeeklyReportHistoryDto> {
    return this.microsoftGraphMailService.getWeeklyReportHistoryForUser({
      userId,
      accountEmail: query.account_email,
      query: query.query,
      maxResults: query.max_results,
    });
  }

  createWeeklyReportDraft(
    payload: WeeklyReportDraftRequestDto,
  ): Promise<WeeklyReportDraftDto> {
    return this.fastapiClientService.createWeeklyReportDraft(payload);
  }

  async createWeeklyReportDraftForUser(
    userId: string,
    payload: WeeklyReportDraftRequestDto,
  ): Promise<WeeklyReportDraftDto> {
    const history = await this.microsoftGraphMailService.getWeeklyReportHistoryForUser({
      userId,
      accountEmail: payload.account_email,
      query: payload.query,
      maxResults: payload.max_examples,
    });

    return this.fastapiClientService.createWeeklyReportDraftFromContext({
      account_email: history.account_email,
      weekly_summary: payload.weekly_summary,
      query: history.query,
      source_examples: history.emails,
      last_week_email: history.last_week_email,
      recipient_override: payload.recipient_override ?? undefined,
      subject_override: payload.subject_override ?? undefined,
    });
  }

  reviseWeeklyReport(
    payload: WeeklyReportReviseRequestDto,
  ): Promise<WeeklyReportDraftDto> {
    return this.fastapiClientService.reviseWeeklyReport(payload);
  }

  sendWeeklyReport(
    payload: WeeklyReportSendRequestDto,
  ): Promise<WeeklyReportSendDto> {
    return this.fastapiClientService.sendWeeklyReport(payload);
  }

  sendWeeklyReportForUser(
    userId: string,
    payload: WeeklyReportSendRequestDto,
  ): Promise<WeeklyReportSendDto> {
    return this.microsoftGraphMailService.sendWeeklyReportForUser({
      userId,
      accountEmail: payload.account_email,
      recipient: payload.recipient,
      subject: payload.subject,
      body: payload.body,
      bodyHtml: payload.body_html,
      confirmSend: payload.confirm_send,
    });
  }

  saveWeeklyReportDraft(
    payload: WeeklyReportSaveDraftRequestDto,
  ): Promise<WeeklyReportSaveDraftDto> {
    return this.fastapiClientService.saveWeeklyReportDraft(payload);
  }

  saveWeeklyReportDraftForUser(
    userId: string,
    payload: WeeklyReportSaveDraftRequestDto,
  ): Promise<WeeklyReportSaveDraftDto> {
    return this.microsoftGraphMailService.saveWeeklyReportDraftForUser({
      userId,
      accountEmail: payload.account_email,
      recipient: payload.recipient,
      subject: payload.subject,
      body: payload.body,
      bodyHtml: payload.body_html,
    });
  }

  private extractCloudinarySpriteUrl(sprite: SpriteSheetResponseDto) {
    const storageRecord =
      sprite.storage_record && typeof sprite.storage_record === 'object'
        ? sprite.storage_record
        : null;
    const cloudinary =
      storageRecord &&
      'cloudinary' in storageRecord &&
      storageRecord.cloudinary &&
      typeof storageRecord.cloudinary === 'object'
        ? storageRecord.cloudinary
        : null;
    const secureUrl =
      cloudinary &&
      'secure_url' in cloudinary &&
      typeof cloudinary.secure_url === 'string'
        ? cloudinary.secure_url.trim()
        : '';

    if (!secureUrl) {
      throw new BadGatewayException(
        'Sprite generation succeeded, but the AI service did not return a Cloudinary URL.',
      );
    }

    return secureUrl;
  }
}
