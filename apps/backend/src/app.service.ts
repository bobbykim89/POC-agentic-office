import { Injectable } from '@nestjs/common';
import type { ApiEvent, HealthStatusDto } from '@agentic-office/shared-types';

@Injectable()
export class AppService {
  getHealth(): HealthStatusDto {
    return {
      status: 'ok',
      service: 'backend',
      timestamp: new Date().toISOString(),
    };
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
