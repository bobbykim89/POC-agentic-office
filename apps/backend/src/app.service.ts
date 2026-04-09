import { Injectable } from '@nestjs/common';
import type {
  AINewsDto,
  ApiEvent,
  DatabaseStatusDto,
  HealthStatusDto,
} from '@agentic-office/shared-types';
import { DatabaseService } from './database/database.service';

@Injectable()
export class AppService {
  constructor(private readonly databaseService: DatabaseService) {}

  getHealth(): HealthStatusDto {
    return {
      status: 'ok',
      service: 'backend',
      timestamp: new Date().toISOString(),
    };
  }

  getDatabaseStatus(): DatabaseStatusDto {
    return this.databaseService.getStatus();
  }

  getSampleEvent(): ApiEvent {
    return {
      id: 'evt_backend_ready',
      type: 'backend.ready',
      payload: {
        message: 'NestJS backend is running',
      },
      createdAt: new Date().toISOString(),
    };
  }

  async getNewsstandItem(): Promise<AINewsDto> {
    const aiServiceUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8001';
    const response = await fetch(`${aiServiceUrl}/agents/ai-news`);

    if (!response.ok) {
      throw new Error(`AI service request failed with status ${response.status}.`);
    }

    return (await response.json()) as AINewsDto;
  }
}
