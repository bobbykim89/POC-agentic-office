import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { ApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { toApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { AuthUserDto } from '../../auth/dto/auth-user.dto';
import type { UserDirectoryItemDto } from '../dto/user-directory-item.dto';
import { UsersService } from '../services/users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<ApiSuccessResponse<UserDirectoryItemDto[]>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return toApiSuccessResponse(await this.usersService.listDirectory(user.userId));
  }

  @Get('me')
  async me(
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<ApiSuccessResponse<AuthUserDto>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    const currentUser = await this.usersService.findById(user.userId);
    if (!currentUser) {
      throw new UnauthorizedException('Authenticated user was not found.');
    }

    return toApiSuccessResponse({
      id: currentUser.id,
      username: currentUser.username,
      email: currentUser.email,
      displayName: currentUser.displayName ?? null,
      spriteSheetUrl: currentUser.spriteSheetUrl ?? null,
    });
  }
}
