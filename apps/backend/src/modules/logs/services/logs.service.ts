import { Injectable } from '@nestjs/common';
import { AgentLogsRepository } from '../repositories/agent-logs.repository';

@Injectable()
export class LogsService {
  constructor(private readonly agentLogsRepository: AgentLogsRepository) {
    void this.agentLogsRepository;
  }
}
