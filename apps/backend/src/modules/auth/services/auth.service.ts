import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersRepository } from '../../users/repositories/users.repository';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async signup(username: string, email: string, password: string) {
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedUsername || !normalizedEmail || !normalizedPassword) {
      throw new BadRequestException('Username, email, and password are required.');
    }

    const existingUser = await this.usersRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException({
        code: 'AUTH_EMAIL_ALREADY_EXISTS',
        message: 'A user with this email already exists.',
      });
    }

    const passwordHash = await this.passwordService.hash(normalizedPassword);
    const user = await this.usersRepository.create({
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
      spriteSheetUrl: null,
    });

    const authenticatedUser = this.toAuthenticatedUser(user);
    const tokens = await this.tokenService.createAuthTokens(authenticatedUser);
    const refreshTokenHash = await this.passwordService.hash(tokens.refreshToken);

    await this.usersRepository.updateRefreshTokenHash(
      authenticatedUser.userId,
      refreshTokenHash,
    );

    return {
      tokens,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName ?? null,
        spriteSheetUrl: user.spriteSheetUrl ?? null,
      },
    };
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      throw new BadRequestException('Email and password are required.');
    }

    const user = await this.usersRepository.findByEmail(normalizedEmail);
    if (!user?.passwordHash) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const passwordMatches = await this.passwordService.compare(
      normalizedPassword,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const authenticatedUser = this.toAuthenticatedUser(user);
    const tokens = await this.tokenService.createAuthTokens(authenticatedUser);
    const refreshTokenHash = await this.passwordService.hash(tokens.refreshToken);

    await this.usersRepository.updateRefreshTokenHash(
      authenticatedUser.userId,
      refreshTokenHash,
    );

    return {
      tokens,
      user: {
        id: authenticatedUser.userId,
        username: authenticatedUser.username,
        email: authenticatedUser.email,
        displayName: user.displayName ?? null,
        spriteSheetUrl: user.spriteSheetUrl ?? null,
      },
    };
  }

  async refresh(refreshToken: string) {
    const normalizedRefreshToken = refreshToken.trim();
    if (!normalizedRefreshToken) {
      throw new BadRequestException('Refresh token is required.');
    }

    const payload = await this.tokenService.verifyRefreshToken(normalizedRefreshToken);
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_INVALID',
        message: 'Invalid refresh token.',
      });
    }

    const user = await this.usersRepository.findById(payload.sub);
    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_INVALID',
        message: 'Refresh token is invalid or revoked.',
      });
    }

    const refreshTokenMatches = await this.passwordService.compare(
      normalizedRefreshToken,
      user.refreshTokenHash,
    );
    if (!refreshTokenMatches) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_INVALID',
        message: 'Refresh token is invalid or revoked.',
      });
    }

    const authenticatedUser = this.toAuthenticatedUser(user);
    const tokens = await this.tokenService.createAuthTokens(authenticatedUser);
    const nextRefreshTokenHash = await this.passwordService.hash(tokens.refreshToken);

    await this.usersRepository.updateRefreshTokenHash(
      authenticatedUser.userId,
      nextRefreshTokenHash,
    );

    return tokens;
  }

  async logout(userId: string) {
    await this.usersRepository.updateRefreshTokenHash(userId, null);
  }

  async getCurrentUser(userId: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Authenticated user was not found.');
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName ?? null,
      spriteSheetUrl: user.spriteSheetUrl ?? null,
    };
  }

  private toAuthenticatedUser(user: {
    id: string;
    email: string;
    username: string;
  }): AuthenticatedUser {
    return {
      userId: user.id,
      email: user.email,
      username: user.username,
    };
  }
}
