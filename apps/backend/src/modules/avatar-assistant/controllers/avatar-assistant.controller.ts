import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import type { AvatarAssistantPreviewMode } from '@agentic-office/shared-types';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { ApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { toApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { CurrentAvatarAssistantMessageDto } from '../dto/avatar-assistant-message.dto';
import { AvatarAssistantService } from '../services/avatar-assistant.service';

@Controller('avatar-assistant')
export class AvatarAssistantController {
  constructor(private readonly avatarAssistantService: AvatarAssistantService) {}

  @Get('message')
  async getCurrentMessage(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('preview') preview: AvatarAssistantPreviewMode | undefined,
  ): Promise<ApiSuccessResponse<CurrentAvatarAssistantMessageDto>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return toApiSuccessResponse(
      await this.avatarAssistantService.getCurrentMessageForUserWithPreview(
        user.userId,
        preview,
      ),
    );
  }
}
