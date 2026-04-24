import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import type { ApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import type { DatabaseStatusDto } from '../dto/database-status.dto';
import type { HealthStatusDto } from '../dto/health-status.dto';
import { HealthService } from '../services/health.service';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): ApiSuccessResponse<HealthStatusDto> {
    return this.healthService.getHealth();
  }

  @Get('database')
  getDatabaseStatus(): ApiSuccessResponse<DatabaseStatusDto> {
    return this.healthService.getDatabaseStatus();
  }
}
