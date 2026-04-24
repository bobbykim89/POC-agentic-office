import type { AuthTokensDto } from './auth-tokens.dto';
import type { AuthUserDto } from './auth-user.dto';

export interface LoginResponseDto {
  tokens: AuthTokensDto;
  user: AuthUserDto;
}
