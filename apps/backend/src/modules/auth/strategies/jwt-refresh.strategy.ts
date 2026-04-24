import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import { TokenService } from '../services/token.service';

function extractRefreshToken(request: { body?: { refreshToken?: string } }) {
  return request.body?.refreshToken ?? null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(tokenService: TokenService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractRefreshToken]),
      ignoreExpiration: false,
      secretOrKey: tokenService.getRefreshTokenSecret(),
      passReqToCallback: false,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      username: payload.username,
    };
  }
}
