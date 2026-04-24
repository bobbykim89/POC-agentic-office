export interface HealthStatusDto {
  status: 'ok' | 'degraded' | 'down';
  service: 'backend';
  timestamp: string;
}
