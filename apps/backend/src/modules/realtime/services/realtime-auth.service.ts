import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { TokenService } from '../../auth/services/token.service';

@Injectable()
export class RealtimeAuthService {
  constructor(private readonly tokenService: TokenService) {}

  extractSocketToken(client: Socket): string | null {
    const authToken = client.handshake.auth.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const authorizationHeader = client.handshake.headers.authorization;
    if (typeof authorizationHeader === 'string') {
      const [scheme, token] = authorizationHeader.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token?.trim()) {
        return token.trim();
      }
    }

    return null;
  }

  async validateSocketToken(token: string): Promise<AuthenticatedUser> {
    const payload = await this.tokenService.verifyAccessToken(token);

    if (payload.type !== 'access') {
      throw new Error('Invalid access token.');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      username: payload.username,
    };
  }
}
