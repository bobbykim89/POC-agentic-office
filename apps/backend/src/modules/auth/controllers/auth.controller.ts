import {
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { ApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { toApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import type { LoginResponseDto } from '../dto/login-response.dto';
import type { AuthTokensDto } from '../dto/auth-tokens.dto';
import type { AuthUserDto } from '../dto/auth-user.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { SignupDto } from '../dto/signup.dto';
import { RefreshTokenGuard } from '../guards/refresh-token.guard';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { AuthService } from '../services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  async signup(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    payload: SignupDto,
  ): Promise<ApiSuccessResponse<LoginResponseDto>> {
    return toApiSuccessResponse(
      await this.authService.signup(payload.username, payload.email, payload.password),
    );
  }

  @Public()
  @Post('login')
  async login(
    @Body() payload: LoginDto,
  ): Promise<ApiSuccessResponse<LoginResponseDto>> {
    return toApiSuccessResponse(
      await this.authService.login(payload.email, payload.password),
    );
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  async refresh(
    @Body() payload: RefreshTokenDto,
  ): Promise<ApiSuccessResponse<AuthTokensDto>> {
    return toApiSuccessResponse(await this.authService.refresh(payload.refreshToken));
  }

  @Post('logout')
  async logout(
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<ApiSuccessResponse<{ loggedOut: true }>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    await this.authService.logout(user.userId);
    return toApiSuccessResponse({ loggedOut: true });
  }

  @Get('me')
  async me(
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<ApiSuccessResponse<AuthUserDto>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return toApiSuccessResponse(await this.authService.getCurrentUser(user.userId));
  }
}
