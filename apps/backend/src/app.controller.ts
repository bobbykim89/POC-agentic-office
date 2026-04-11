import { Body, Controller, Get, HttpException, HttpStatus, Post, Query } from '@nestjs/common';
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
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): HealthStatusDto {
    return this.appService.getHealth();
  }

  @Get('database/status')
  getDatabaseStatus(): DatabaseStatusDto {
    return this.appService.getDatabaseStatus();
  }

  @Get('events/sample')
  getSampleEvent(): ApiEvent {
    return this.appService.getSampleEvent();
  }

  @Get('office/newsstand')
  async getNewsstandItem(): Promise<AINewsDto> {
    try {
      return await this.appService.getNewsstandItem();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown backend error.';
      throw new HttpException(
        `Newsstand request failed: ${detail}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Post('office/main-computers/linkedin-post')
  async createLinkedInPost(
    @Body() payload: LinkedInPostRequestDto,
  ): Promise<LinkedInPostDto> {
    try {
      return await this.appService.createLinkedInPost(payload);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown backend error.';
      throw new HttpException(
        `LinkedIn post request failed: ${detail}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Post('office/main-computers/weekly-report/draft')
  async createWeeklyReportDraft(
    @Body() payload: WeeklyReportDraftRequestDto,
  ): Promise<WeeklyReportDraftDto> {
    try {
      return await this.appService.createWeeklyReportDraft(payload);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown backend error.';
      throw new HttpException(
        `515 draft request failed: ${detail}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Get('office/main-computers/weekly-report/accounts')
  async getConnectedWeeklyReportAccounts(): Promise<ConnectedMicrosoftAccountDto[]> {
    try {
      return await this.appService.getConnectedWeeklyReportAccounts();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown backend error.';
      throw new HttpException(
        `515 account lookup failed: ${detail}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Get('office/main-computers/weekly-report/history')
  async getWeeklyReportHistory(
    @Query('account_email') accountEmail: string,
    @Query('query') query?: string,
    @Query('max_results') maxResults?: string,
  ): Promise<WeeklyReportHistoryDto> {
    try {
      return await this.appService.getWeeklyReportHistory({
        accountEmail,
        query,
        maxResults,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown backend error.';
      throw new HttpException(
        `515 history request failed: ${detail}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Post('office/main-computers/weekly-report/revise')
  async reviseWeeklyReportDraft(
    @Body() payload: WeeklyReportReviseRequestDto,
  ): Promise<WeeklyReportDraftDto> {
    try {
      return await this.appService.reviseWeeklyReportDraft(payload);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown backend error.';
      throw new HttpException(
        `515 revise request failed: ${detail}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Post('office/main-computers/weekly-report/save-draft')
  async saveWeeklyReportDraft(
    @Body() payload: WeeklyReportSaveDraftRequestDto,
  ): Promise<WeeklyReportSaveDraftDto> {
    try {
      return await this.appService.saveWeeklyReportDraft(payload);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown backend error.';
      throw new HttpException(
        `515 save draft request failed: ${detail}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Post('office/main-computers/weekly-report/send')
  async sendWeeklyReport(
    @Body() payload: WeeklyReportSendRequestDto,
  ): Promise<WeeklyReportSendDto> {
    try {
      return await this.appService.sendWeeklyReport(payload);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown backend error.';
      throw new HttpException(
        `515 send request failed: ${detail}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
