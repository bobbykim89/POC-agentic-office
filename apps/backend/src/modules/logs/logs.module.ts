import { Module } from '@nestjs/common';
import { AgentLogsRepository } from './repositories/agent-logs.repository';
import { AuditLogService } from './services/audit-log.service';
import { LogsService } from './services/logs.service';

@Module({
  providers: [LogsService, AuditLogService, AgentLogsRepository],
  exports: [LogsService, AuditLogService, AgentLogsRepository],
})
export class LogsModule {}
