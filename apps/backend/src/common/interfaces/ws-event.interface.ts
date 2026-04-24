import type { ApiError } from './api-error.interface';

export interface WsEventEnvelope<TData = Record<string, unknown>> {
  event: string;
  ok: boolean;
  data?: TData;
  error?: ApiError;
}
