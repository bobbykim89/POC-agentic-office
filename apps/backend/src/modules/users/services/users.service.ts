import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import type { UserDirectoryItemDto } from '../dto/user-directory-item.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findById(userId: string) {
    return this.usersRepository.findById(userId);
  }

  async listDirectory(excludeUserId?: string): Promise<UserDirectoryItemDto[]> {
    const users = await this.usersRepository.listDirectory(excludeUserId);
    return users.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? null,
      spriteSheetUrl: user.spriteSheetUrl ?? null,
    }));
  }
}
