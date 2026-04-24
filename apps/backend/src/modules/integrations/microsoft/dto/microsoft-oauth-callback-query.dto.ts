import { IsString, MinLength } from 'class-validator';

export class MicrosoftOauthCallbackQueryDto {
  @IsString()
  @MinLength(1)
  state!: string;

  @IsString()
  @MinLength(1)
  code!: string;
}
