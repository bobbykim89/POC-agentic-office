export interface DatabaseStatusDto {
  connected: boolean;
  dialect: 'postgresql';
  drizzle: true;
  urlConfigured: boolean;
}
