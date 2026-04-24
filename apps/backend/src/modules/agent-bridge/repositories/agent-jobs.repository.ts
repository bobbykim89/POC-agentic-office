import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import { agentJobs } from '../../../database/schema/agent-jobs.schema';

@Injectable()
export class AgentJobsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(input: {
    userId: string;
    type: string;
    sourceTransport: 'rest' | 'ws';
    requestPayload: unknown;
    conversationId?: string | null;
    messageId?: string | null;
  }) {
    const db = this.requireDb();
    const [job] = await db
      .insert(agentJobs)
      .values({
        userId: input.userId,
        type: input.type,
        status: 'pending',
        sourceTransport: input.sourceTransport,
        requestPayload: input.requestPayload,
        conversationId: input.conversationId ?? null,
        messageId: input.messageId ?? null,
      })
      .returning();

    return job;
  }

  async findById(jobId: string) {
    const db = this.requireDb();
    const [job] = await db.select().from(agentJobs).where(eq(agentJobs.id, jobId)).limit(1);
    return job ?? null;
  }

  async findByIdForUser(jobId: string, userId: string) {
    const db = this.requireDb();
    const [job] = await db
      .select()
      .from(agentJobs)
      .where(and(eq(agentJobs.id, jobId), eq(agentJobs.userId, userId)))
      .limit(1);

    return job ?? null;
  }

  async listRecentForUser(userId: string, limit: number) {
    const db = this.requireDb();
    return db
      .select()
      .from(agentJobs)
      .where(eq(agentJobs.userId, userId))
      .orderBy(desc(agentJobs.createdAt))
      .limit(limit);
  }

  async markRunning(jobId: string) {
    const db = this.requireDb();
    const [job] = await db
      .update(agentJobs)
      .set({
        status: 'running',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentJobs.id, jobId))
      .returning();

    return job;
  }

  async markCompleted(jobId: string, responsePayload: unknown) {
    const db = this.requireDb();
    const [job] = await db
      .update(agentJobs)
      .set({
        status: 'completed',
        responsePayload,
        errorCode: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentJobs.id, jobId))
      .returning();

    return job;
  }

  async markFailed(jobId: string, errorCode: string, responsePayload?: unknown) {
    const db = this.requireDb();
    const [job] = await db
      .update(agentJobs)
      .set({
        status: 'failed',
        errorCode,
        responsePayload: responsePayload ?? null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentJobs.id, jobId))
      .returning();

    return job;
  }

  private requireDb() {
    if (!this.databaseService.db) {
      throw new Error('DATABASE_URL is not configured for agent bridge operations.');
    }

    return this.databaseService.db;
  }
}
