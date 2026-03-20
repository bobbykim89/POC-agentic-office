import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { DatabaseStatusDto } from '@agentic-office/shared-types';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly connectionString = process.env.DATABASE_URL;
  private readonly pool = this.connectionString
    ? new Pool({ connectionString: this.connectionString })
    : null;
  private readonly dbInstance = this.pool
    ? drizzle(this.pool, { schema })
    : null;

  get db(): NodePgDatabase<typeof schema> | null {
    return this.dbInstance;
  }

  getStatus(): DatabaseStatusDto {
    return {
      connected: this.pool !== null,
      dialect: 'postgresql',
      drizzle: true,
      urlConfigured: Boolean(this.connectionString),
    };
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
