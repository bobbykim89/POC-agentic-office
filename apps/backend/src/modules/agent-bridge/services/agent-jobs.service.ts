import { Injectable } from '@nestjs/common';
import type { RealtimeAgentResultDto } from '../../realtime/dto/realtime-agent-result.dto';
import { RealtimeEmitterService } from '../../realtime/services/realtime-emitter.service';
import type { AgentJobDto } from '../dto/agent-job.dto';
import type { AgentJobRequestDto } from '../dto/agent-job-request.dto';
import { AgentJobsRepository } from '../repositories/agent-jobs.repository';
import { AgentBridgeLogsRepository } from '../repositories/agent-logs.repository';
import { FastapiClientService } from './fastapi-client.service';

@Injectable()
export class AgentJobsService {
  constructor(
    private readonly agentJobsRepository: AgentJobsRepository,
    private readonly agentBridgeLogsRepository: AgentBridgeLogsRepository,
    private readonly fastapiClientService: FastapiClientService,
    private readonly realtimeEmitterService: RealtimeEmitterService,
  ) {}

  async createPendingJob(
    userId: string,
    input: AgentJobRequestDto,
    sourceTransport: 'rest' | 'ws',
  ): Promise<AgentJobDto> {
    const requestPayload = this.serializeRequest(input);
    const job = await this.agentJobsRepository.create({
      userId,
      type: input.type,
      sourceTransport,
      requestPayload,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
    });

    await this.agentBridgeLogsRepository.create({
      userId,
      agentJobId: job.id,
      eventType: 'agent_job.created',
      requestPayload,
      message: `Queued agent job ${input.type}.`,
    });

    return this.toAgentJobDto(job);
  }

  async getJobForUser(jobId: string, userId: string): Promise<AgentJobDto | null> {
    const job = await this.agentJobsRepository.findByIdForUser(jobId, userId);
    return job ? this.toAgentJobDto(job) : null;
  }

  async listRecentJobsForUser(userId: string, limit: number): Promise<AgentJobDto[]> {
    const jobs = await this.agentJobsRepository.listRecentForUser(userId, limit);
    return jobs.map((job) => this.toAgentJobDto(job));
  }

  async processJob(jobId: string) {
    const pendingJob = await this.agentJobsRepository.findById(jobId);
    if (!pendingJob) {
      return;
    }

    const runningJob = await this.agentJobsRepository.markRunning(jobId);
    if (!runningJob) {
      return;
    }

    try {
      const responsePayload = await this.dispatchUpstreamCall(
        this.deserializeRequest(runningJob.requestPayload),
      );
      const completedJob = await this.agentJobsRepository.markCompleted(jobId, responsePayload);

      await this.agentBridgeLogsRepository.create({
        userId: runningJob.userId,
        agentJobId: jobId,
        eventType: 'agent_job.completed',
        requestPayload: this.safeRecord(runningJob.requestPayload),
        responsePayload,
        message: `Completed agent job ${runningJob.type}.`,
      });

      if (completedJob) {
        this.realtimeEmitterService.emitAgentResultToUsers(
          [completedJob.userId],
          this.toRealtimeAgentResult(completedJob),
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Agent bridge request failed.';
      const failedJob = await this.agentJobsRepository.markFailed(jobId, 'AGENT_JOB_FAILED', {
        message: errorMessage,
      });

      await this.agentBridgeLogsRepository.create({
        userId: runningJob.userId,
        agentJobId: jobId,
        eventType: 'agent_job.failed',
        requestPayload: this.safeRecord(runningJob.requestPayload),
        responsePayload: {
          message: errorMessage,
        },
        errorCode: 'AGENT_JOB_FAILED',
        message: errorMessage,
      });

      if (failedJob) {
        this.realtimeEmitterService.emitAgentResultToUsers(
          [failedJob.userId],
          this.toRealtimeAgentResult(failedJob),
        );
      }
    }
  }

  private async dispatchUpstreamCall(request: AgentJobRequestDto): Promise<unknown> {
    switch (request.type) {
      case 'linkedin-post':
        return this.fastapiClientService.createLinkedinPost(
          request.body as unknown as import('@agentic-office/shared-types').LinkedInPostRequestDto,
        );
      case 'sprite-sheet':
        return this.fastapiClientService.createSpriteSheet(
          request.body as unknown as import('../dto/sprite-sheet-request.dto').SpriteSheetRequestDto,
        );
      case 'ai-news':
        return this.fastapiClientService.getAiNews();
      case 'weekly-report-microsoft-auth-start':
        return this.fastapiClientService.startWeeklyReportMicrosoftAuth();
      case 'weekly-report-microsoft-accounts':
        return this.fastapiClientService.getWeeklyReportMicrosoftAccounts();
      case 'weekly-report-history':
        return this.fastapiClientService.getWeeklyReportHistory(
          request.query as {
            account_email: string;
            query?: string;
            max_results?: number;
          },
        );
      case 'weekly-report-draft':
        return this.fastapiClientService.createWeeklyReportDraft(
          request.body as unknown as import('@agentic-office/shared-types').WeeklyReportDraftRequestDto,
        );
      case 'weekly-report-revise':
        return this.fastapiClientService.reviseWeeklyReport(
          request.body as unknown as import('@agentic-office/shared-types').WeeklyReportReviseRequestDto,
        );
      case 'weekly-report-send':
        return this.fastapiClientService.sendWeeklyReport(
          request.body as unknown as import('@agentic-office/shared-types').WeeklyReportSendRequestDto,
        );
      case 'weekly-report-save-draft':
        return this.fastapiClientService.saveWeeklyReportDraft(
          request.body as unknown as import('@agentic-office/shared-types').WeeklyReportSaveDraftRequestDto,
        );
      default:
        throw new Error(`Unsupported agent job type: ${request.type}`);
    }
  }

  private toRealtimeAgentResult(job: {
    id: string;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    conversationId: string | null;
    responsePayload: unknown;
    errorCode: string | null;
  }): RealtimeAgentResultDto & { conversationId?: string | null } {
    return {
      jobId: job.id,
      type: job.type,
      status: job.status === 'failed' ? 'failed' : 'completed',
      conversationId: job.conversationId ?? null,
      result:
        job.status === 'completed'
          ? this.toRealtimeResultPayload(job.responsePayload)
          : undefined,
      error:
        job.status === 'failed'
          ? {
              code: job.errorCode ?? 'AGENT_JOB_FAILED',
              message:
                this.safeRecord(job.responsePayload)?.message?.toString() ??
                'Agent job failed.',
            }
          : undefined,
    };
  }

  private toAgentJobDto(job: {
    id: string;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    sourceTransport: 'rest' | 'ws';
    conversationId: string | null;
    messageId: string | null;
    requestPayload: unknown;
    responsePayload: unknown;
    errorCode: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): AgentJobDto {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      sourceTransport: job.sourceTransport,
      conversationId: job.conversationId ?? null,
      messageId: job.messageId ?? null,
      requestPayload: job.requestPayload ?? null,
      responsePayload: job.responsePayload ?? null,
      errorCode: job.errorCode ?? null,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private serializeRequest(input: AgentJobRequestDto): Record<string, unknown> {
    return {
      upstreamPath: input.upstreamPath,
      method: input.method,
      body: input.body ?? null,
      query: input.query ?? null,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      type: input.type,
    };
  }

  private deserializeRequest(payload: unknown): AgentJobRequestDto {
    const record = this.safeRecord(payload);
    if (!record?.upstreamPath || !record?.method || !record?.type) {
      throw new Error('Stored agent job payload is invalid.');
    }

    return {
      type: String(record.type),
      upstreamPath: String(record.upstreamPath),
      method: record.method === 'GET' ? 'GET' : 'POST',
      body: this.safeRecord(record.body) ?? undefined,
      query: this.safeRecord(record.query) as Record<
        string,
        string | number | boolean | undefined
      >,
      conversationId:
        typeof record.conversationId === 'string' ? record.conversationId : null,
      messageId: typeof record.messageId === 'string' ? record.messageId : null,
    };
  }

  private safeRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return null;
  }

  private toRealtimeResultPayload(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return { items: value as unknown[] };
      }

      return value as Record<string, unknown>;
    }

    return {
      value,
    };
  }
}
