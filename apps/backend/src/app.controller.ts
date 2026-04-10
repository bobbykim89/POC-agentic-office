import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import type {
  AINewsDto,
  ApiEvent,
  DatabaseStatusDto,
  HealthStatusDto,
} from '@agentic-office/shared-types';
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

  @Get('office/newsstand')
  async getNewsstandItem(): Promise<AINewsDto> {
    try {
      return await this.appService.getNewsstandItem();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown backend error.';
      throw new HttpException(
        `Newsstand request failed: ${detail}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
