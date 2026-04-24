export interface RealtimeAgentResultDto {
  jobId: string;
  type: string;
  status: 'completed' | 'failed';
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
}
