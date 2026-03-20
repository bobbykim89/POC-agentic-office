import { Controller, Get } from '@nestjs/common';
import type { ApiEvent, DatabaseStatusDto, HealthStatusDto } from '@agentic-office/shared-types';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): HealthStatusDto {
    return this.appService.getHealth();
  }

  @Get('database/status')
  getDatabaseStatus(): DatabaseStatusDto {
    return this.appService.getDatabaseStatus();
  }

  @Get('events/sample')
  getSampleEvent(): ApiEvent {
    return this.appService.getSampleEvent();
  }
}
