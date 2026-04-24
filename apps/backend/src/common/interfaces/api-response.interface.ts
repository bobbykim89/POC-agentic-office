import type { ApiError } from './api-error.interface';

export interface ApiSuccessResponse<TData> {
  ok: true;
  data: TData;
}

export interface ApiErrorResponse {
  ok: false;
  error: ApiError;
}

export type ApiResponse<TData> = ApiSuccessResponse<TData> | ApiErrorResponse;

export function toApiSuccessResponse<TData>(data: TData): ApiSuccessResponse<TData> {
  return {
    ok: true,
    data,
  };
}
