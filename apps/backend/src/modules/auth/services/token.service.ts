import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class TokenService {
  private readonly accessTokenSecret =
    process.env.JWT_ACCESS_SECRET ?? 'agentic-office-access-secret';
  private readonly refreshTokenSecret =
    process.env.JWT_REFRESH_SECRET ?? 'agentic-office-refresh-secret';
  private readonly accessTokenTtlSeconds = this.parseTtlToSeconds(
    process.env.JWT_ACCESS_TTL ?? '15m',
    15 * 60,
  );
  private readonly refreshTokenTtlSeconds = this.parseTtlToSeconds(
    process.env.JWT_REFRESH_TTL ?? '7d',
    7 * 24 * 60 * 60,
  );

  constructor(private readonly jwtService: JwtService) {}

  async createAuthTokens(user: AuthenticatedUser) {
    const accessPayload: JwtPayload = {
      sub: user.userId,
      email: user.email,
      username: user.username,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      ...accessPayload,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.accessTokenSecret,
        expiresIn: this.accessTokenTtlSeconds,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.refreshTokenSecret,
        expiresIn: this.refreshTokenTtlSeconds,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token, {
      secret: this.accessTokenSecret,
    });
  }

  verifyRefreshToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token, {
      secret: this.refreshTokenSecret,
    });
  }

  getAccessTokenSecret() {
    return this.accessTokenSecret;
  }

  getRefreshTokenSecret() {
    return this.refreshTokenSecret;
  }

  private parseTtlToSeconds(value: string, fallbackSeconds: number): number {
    const normalizedValue = value.trim().toLowerCase();
    const exactSeconds = Number(normalizedValue);
    if (Number.isFinite(exactSeconds) && exactSeconds > 0) {
      return exactSeconds;
    }

    const match = normalizedValue.match(/^(\d+)([smhd])$/);
    if (!match) {
      return fallbackSeconds;
    }

    const amount = Number(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return amount;
      case 'm':
        return amount * 60;
      case 'h':
        return amount * 60 * 60;
      case 'd':
        return amount * 24 * 60 * 60;
      default:
        return fallbackSeconds;
    }
  }
}
