import {
  CanActivate,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { TokenService } from '../services/token.service';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const authToken = client.handshake.auth.token;
    const authorizationHeader = client.handshake.headers.authorization;

    const token =
      typeof authToken === 'string' && authToken.trim()
        ? authToken.trim()
        : typeof authorizationHeader === 'string' &&
            authorizationHeader.toLowerCase().startsWith('bearer ')
          ? authorizationHeader.slice(7).trim()
          : null;

    if (!token) {
      throw new UnauthorizedException('Authentication token is missing.');
    }

    const payload = await this.tokenService.verifyAccessToken(token);
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Authentication token is invalid.');
    }

    client.data.user = {
      userId: payload.sub,
      email: payload.email,
      username: payload.username,
    };
    return true;
  }
}
