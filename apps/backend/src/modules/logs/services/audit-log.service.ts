import { Injectable } from '@nestjs/common';
import { AgentLogsRepository } from '../repositories/agent-logs.repository';

@Injectable()
export class AuditLogService {
  constructor(private readonly agentLogsRepository: AgentLogsRepository) {
    void this.agentLogsRepository;
  }
}
