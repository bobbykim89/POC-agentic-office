import type { AuthUserDto } from '../../auth/dto/auth-user.dto';
import type { SpriteSheetResponseDto } from './sprite-sheet-response.dto';

export interface SpriteSheetGenerationResultDto {
  spriteSheetUrl: string;
  user: AuthUserDto;
  sprite: SpriteSheetResponseDto;
}
