import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import type { ApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { toApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { MicrosoftAuthStartDto } from '../dto/microsoft-auth-start.dto';
import type { SpriteSheetRequestDto } from '../dto/sprite-sheet-request.dto';
import type { SpriteSheetGenerationResultDto } from '../dto/sprite-sheet-generation-result.dto';
import type { SpriteSheetResponseDto } from '../dto/sprite-sheet-response.dto';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AgentBridgeService } from '../services/agent-bridge.service';

@Controller('agents')
export class AgentBridgeController {
  constructor(private readonly agentBridgeService: AgentBridgeService) {}

  @Post('linkedin-post')
  async linkedinPost(
    @Body() payload: LinkedInPostRequestDto,
  ): Promise<ApiSuccessResponse<LinkedInPostDto>> {
    return toApiSuccessResponse(
      await this.agentBridgeService.createLinkedinPost(payload),
    );
  }

  @Post('sprite-sheet')
  @UseInterceptors(FileInterceptor('image'))
  async spriteSheet(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() payload: SpriteSheetRequestDto,
    @UploadedFile()
    file?: { buffer?: Buffer; mimetype?: string; originalname?: string },
  ): Promise<ApiSuccessResponse<SpriteSheetGenerationResultDto>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return toApiSuccessResponse(
      await this.agentBridgeService.createSpriteSheetForUser(user.userId, {
        description: payload.description,
        imageBuffer: file?.buffer,
        imageMimeType: file?.mimetype ?? null,
        imageFilename: file?.originalname ?? null,
      }),
    );
  }

  @Get('ai-news')
  async aiNews(): Promise<ApiSuccessResponse<AINewsDto>> {
    return toApiSuccessResponse(await this.agentBridgeService.getAiNews());
  }

  @Get('weekly-report/microsoft/auth/start')
  async weeklyReportMicrosoftAuthStart(): Promise<ApiSuccessResponse<MicrosoftAuthStartDto>> {
    return toApiSuccessResponse(
      await this.agentBridgeService.startWeeklyReportMicrosoftAuth(),
    );
  }

  @Get('weekly-report/microsoft/auth/callback')
  async weeklyReportMicrosoftAuthCallback(
    @Query('state') state: string,
    @Query('code') code: string,
  ): Promise<ApiSuccessResponse<ConnectedMicrosoftAccountDto>> {
    return toApiSuccessResponse(
      await this.agentBridgeService.finishWeeklyReportMicrosoftAuth({ state, code }),
    );
  }

  @Get('weekly-report/microsoft/accounts')
  async weeklyReportMicrosoftAccounts(): Promise<
    ApiSuccessResponse<ConnectedMicrosoftAccountDto[]>
  > {
    return toApiSuccessResponse(
      await this.agentBridgeService.getWeeklyReportMicrosoftAccounts(),
    );
  }

  @Get('weekly-report/history')
  async weeklyReportHistory(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('account_email') accountEmail: string,
    @Query('query') query?: string,
    @Query('max_results') maxResults?: string,
  ): Promise<ApiSuccessResponse<WeeklyReportHistoryDto>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return toApiSuccessResponse(
      await this.agentBridgeService.getWeeklyReportHistoryForUser(user.userId, {
        account_email: accountEmail,
        query,
        max_results: maxResults ? Number(maxResults) : undefined,
      }),
    );
  }

  @Post('weekly-report/draft')
  async weeklyReportDraft(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() payload: WeeklyReportDraftRequestDto,
  ): Promise<ApiSuccessResponse<WeeklyReportDraftDto>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return toApiSuccessResponse(
      await this.agentBridgeService.createWeeklyReportDraftForUser(user.userId, payload),
    );
  }

  @Post('weekly-report/revise')
  async weeklyReportRevise(
    @Body() payload: WeeklyReportReviseRequestDto,
  ): Promise<ApiSuccessResponse<WeeklyReportDraftDto>> {
    return toApiSuccessResponse(
      await this.agentBridgeService.reviseWeeklyReport(payload),
    );
  }

  @Post('weekly-report/send')
  async weeklyReportSend(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() payload: WeeklyReportSendRequestDto,
  ): Promise<ApiSuccessResponse<WeeklyReportSendDto>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return toApiSuccessResponse(
      await this.agentBridgeService.sendWeeklyReportForUser(user.userId, payload),
    );
  }

  @Post('weekly-report/save-draft')
  async weeklyReportSaveDraft(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() payload: WeeklyReportSaveDraftRequestDto,
  ): Promise<ApiSuccessResponse<WeeklyReportSaveDraftDto>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return toApiSuccessResponse(
      await this.agentBridgeService.saveWeeklyReportDraftForUser(user.userId, payload),
    );
  }
}
