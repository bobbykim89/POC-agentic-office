import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { ApiErrorResponse } from '../interfaces/api-response.interface';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<{
      status: (code: number) => { json: (body: ApiErrorResponse) => void };
    }>();

    const status = this.resolveStatus(exception);
    const error = this.resolveError(exception, status);

    response.status(status).json({
      ok: false,
      error,
    } satisfies ApiErrorResponse);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveError(exception: unknown, status: number) {
    if (exception instanceof UnauthorizedException) {
      const response = exception.getResponse();
      if (
        typeof response === 'object' &&
        response !== null &&
        'code' in response &&
        'message' in response &&
        typeof response.code === 'string' &&
        typeof response.message === 'string'
      ) {
        return {
          code: response.code,
          message: response.message,
        };
      }

      return {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Authentication failed.',
      };
    }

    if (exception instanceof BadRequestException) {
      return {
        code: 'BAD_REQUEST',
        message: this.extractHttpMessage(exception),
      };
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (
        typeof response === 'object' &&
        response !== null &&
        'code' in response &&
        'message' in response &&
        typeof response.code === 'string' &&
        typeof response.message === 'string'
      ) {
        return {
          code: response.code,
          message: response.message,
        };
      }

      return {
        code: this.defaultCodeForStatus(status),
        message: this.extractHttpMessage(exception),
      };
    }

    if (exception instanceof Error) {
      return {
        code: 'INTERNAL_SERVER_ERROR',
        message: exception.message,
      };
    }

    return {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    };
  }

  private extractHttpMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (
      typeof response === 'object' &&
      response !== null &&
      'message' in response
    ) {
      const message = response.message;
      if (Array.isArray(message)) {
        return message.join(', ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }

    return exception.message;
  }

  private defaultCodeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'AUTH_TOKEN_INVALID';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
