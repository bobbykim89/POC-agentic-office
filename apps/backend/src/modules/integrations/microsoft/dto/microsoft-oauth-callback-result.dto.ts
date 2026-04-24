export interface MicrosoftOauthCallbackResultDto {
  account: {
    id: string;
    email: string;
    connectedAt: string;
    scopes: string[];
  };
  redirectTo: string | null;
}
