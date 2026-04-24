export interface MicrosoftAccountDto {
  id: string;
  provider: 'microsoft';
  accountEmail: string;
  connectedAt: string;
  scopes: string[];
  tokenExpiresAt: string | null;
}
