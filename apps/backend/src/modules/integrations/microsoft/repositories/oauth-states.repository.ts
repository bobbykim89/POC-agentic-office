import { Injectable } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { DatabaseService } from '../../../../database/database.service';
import { oauthStates } from '../../../../database/schema/oauth-states.schema';

@Injectable()
export class OauthStatesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(input: {
    provider: 'microsoft';
    userId: string;
    state: string;
    redirectTo: string | null;
    expiresAt: Date;
  }) {
    const db = this.requireDb();
    const [record] = await db
      .insert(oauthStates)
      .values({
        provider: input.provider,
        userId: input.userId,
        state: input.state,
        redirectTo: input.redirectTo,
        expiresAt: input.expiresAt,
      })
      .returning();

    return record;
  }

  async consumeMicrosoftState(state: string) {
    const db = this.requireDb();
    await db
      .delete(oauthStates)
      .where(lt(oauthStates.expiresAt, new Date()));

    const [record] = await db
      .select()
      .from(oauthStates)
      .where(
        and(eq(oauthStates.provider, 'microsoft'), eq(oauthStates.state, state)),
      )
      .limit(1);

    if (!record) {
      return null;
    }

    await db.delete(oauthStates).where(eq(oauthStates.id, record.id));

    if (record.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return record;
  }

  private requireDb() {
    if (!this.databaseService.db) {
      throw new Error('DATABASE_URL is not configured for Microsoft integration operations.');
    }

    return this.databaseService.db;
  }
}
