import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../../database/database.service';
import { externalAccounts } from '../../../../database/schema/external-accounts.schema';

@Injectable()
export class ExternalAccountsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findMicrosoftAccountsForUser(userId: string) {
    const db = this.requireDb();
    return db
      .select()
      .from(externalAccounts)
      .where(
        and(
          eq(externalAccounts.userId, userId),
          eq(externalAccounts.provider, 'microsoft'),
        ),
      )
      .orderBy(desc(externalAccounts.connectedAt));
  }

  async findMicrosoftAccountByEmailForUser(userId: string, accountEmail: string) {
    const db = this.requireDb();
    const [account] = await db
      .select()
      .from(externalAccounts)
      .where(
        and(
          eq(externalAccounts.userId, userId),
          eq(externalAccounts.provider, 'microsoft'),
          eq(externalAccounts.providerAccountEmail, accountEmail.trim().toLowerCase()),
        ),
      )
      .limit(1);

    return account ?? null;
  }

  async upsertMicrosoftAccount(input: {
    userId: string;
    providerAccountId: string | null;
    providerAccountEmail: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
    scopes: string[];
  }) {
    const db = this.requireDb();
    const [account] = await db
      .insert(externalAccounts)
      .values({
        userId: input.userId,
        provider: 'microsoft',
        providerAccountId: input.providerAccountId,
        providerAccountEmail: input.providerAccountEmail,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        tokenExpiresAt: input.tokenExpiresAt,
        scopes: input.scopes,
        connectedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          externalAccounts.provider,
          externalAccounts.userId,
          externalAccounts.providerAccountEmail,
        ],
        set: {
          providerAccountId: input.providerAccountId,
          accessTokenEncrypted: input.accessTokenEncrypted,
          refreshTokenEncrypted: input.refreshTokenEncrypted,
          tokenExpiresAt: input.tokenExpiresAt,
          scopes: input.scopes,
          connectedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    return account;
  }

  async updateMicrosoftTokens(input: {
    accountId: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
  }) {
    const db = this.requireDb();
    const [account] = await db
      .update(externalAccounts)
      .set({
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        tokenExpiresAt: input.tokenExpiresAt,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(externalAccounts.id, input.accountId))
      .returning();

    return account;
  }

  async touchLastUsedAt(accountId: string) {
    const db = this.requireDb();
    await db
      .update(externalAccounts)
      .set({
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(externalAccounts.id, accountId));
  }

  private requireDb() {
    if (!this.databaseService.db) {
      throw new Error('DATABASE_URL is not configured for Microsoft integration operations.');
    }

    return this.databaseService.db;
  }
}
