import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export interface DatabaseStatus {
  connected: boolean;
  dialect: 'postgresql';
  drizzle: true;
  urlConfigured: boolean;
}

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

  getStatus(): DatabaseStatus {
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
