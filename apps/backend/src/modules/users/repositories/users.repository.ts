import { Injectable } from '@nestjs/common';
import { asc, eq, ne } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import { users } from '../../../database/schema/users.schema';

@Injectable()
export class UsersRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByEmail(email: string) {
    const db = this.requireDb();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async findById(id: string) {
    const db = this.requireDb();
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async listDirectory(excludeUserId?: string) {
    const db = this.requireDb();
    const query = db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        spriteSheetUrl: users.spriteSheetUrl,
      })
      .from(users)
      .orderBy(asc(users.displayName), asc(users.username));

    if (!excludeUserId) {
      return query;
    }

    return query.where(ne(users.id, excludeUserId));
  }

  async create(input: {
    username: string;
    email: string;
    passwordHash: string;
    spriteSheetUrl?: string | null;
  }) {
    const db = this.requireDb();
    const [user] = await db
      .insert(users)
      .values({
        username: input.username,
        email: input.email,
        passwordHash: input.passwordHash,
        spriteSheetUrl: input.spriteSheetUrl ?? null,
      })
      .returning();

    return user;
  }

  async updateRefreshTokenHash(userId: string, refreshTokenHash: string | null) {
    const db = this.requireDb();
    await db
      .update(users)
      .set({
        refreshTokenHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async updateSpriteSheetUrl(userId: string, spriteSheetUrl: string | null) {
    const db = this.requireDb();
    const [user] = await db
      .update(users)
      .set({
        spriteSheetUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  private requireDb() {
    if (!this.databaseService.db) {
      throw new Error('DATABASE_URL is not configured for auth operations.');
    }

    return this.databaseService.db;
  }
}
