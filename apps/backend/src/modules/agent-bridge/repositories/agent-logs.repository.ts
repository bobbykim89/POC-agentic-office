import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { logs } from '../../../database/schema/logs.schema';

@Injectable()
export class AgentBridgeLogsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(input: {
    userId?: string | null;
    agentJobId?: string | null;
    eventType: string;
    requestPayload?: unknown;
    responsePayload?: unknown;
    errorCode?: string | null;
    message?: string | null;
  }) {
    const db = this.requireDb();
    const [log] = await db
      .insert(logs)
      .values({
        userId: input.userId ?? null,
        agentJobId: input.agentJobId ?? null,
        scope: 'agent',
        eventType: input.eventType,
        requestPayload: input.requestPayload ?? null,
        responsePayload: input.responsePayload ?? null,
        errorCode: input.errorCode ?? null,
        message: input.message ?? null,
      })
      .returning();

    return log;
  }

  private requireDb() {
    if (!this.databaseService.db) {
      throw new Error('DATABASE_URL is not configured for agent bridge logging.');
    }

    return this.databaseService.db;
  }
}
