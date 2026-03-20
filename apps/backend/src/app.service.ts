import { Injectable } from '@nestjs/common';
import type { ApiEvent, DatabaseStatusDto, HealthStatusDto } from '@agentic-office/shared-types';
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
}
