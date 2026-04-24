import { Injectable } from '@nestjs/common';
import type { ApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { toApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { DatabaseService } from '../../../database/database.service';
import type { DatabaseStatusDto } from '../dto/database-status.dto';
import type { HealthStatusDto } from '../dto/health-status.dto';

@Injectable()
export class HealthService {
  constructor(private readonly databaseService: DatabaseService) {}

  getHealth(): ApiSuccessResponse<HealthStatusDto> {
    return toApiSuccessResponse({
      status: 'ok',
      service: 'backend',
      timestamp: new Date().toISOString(),
    });
  }

  getDatabaseStatus(): ApiSuccessResponse<DatabaseStatusDto> {
    return toApiSuccessResponse(this.databaseService.getStatus());
  }
}
