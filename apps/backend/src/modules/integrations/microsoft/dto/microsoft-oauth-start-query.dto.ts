import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MicrosoftOauthStartQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  redirectTo?: string;
}
