import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';

export class AgentRequestFailedException extends BadRequestException {
  constructor(message = 'The AI agent request was rejected.', details?: Record<string, unknown>) {
    super({
      code: 'AGENT_REQUEST_FAILED',
      message,
      details,
    });
  }
}

export class AgentUpstreamFailedException extends BadGatewayException {
  constructor(
    message = 'The AI agent service failed to process the request.',
    details?: Record<string, unknown>,
  ) {
    super({
      code: 'AGENT_REQUEST_FAILED',
      message,
      details,
    });
  }
}

export class AgentConnectionFailedException extends ServiceUnavailableException {
  constructor(message = 'Could not reach the AI agent service.') {
    super({
      code: 'AGENT_REQUEST_FAILED',
      message,
    });
  }
}

export class AgentTimeoutException extends GatewayTimeoutException {
  constructor(message = 'The AI service timed out.') {
    super({
      code: 'AGENT_TIMEOUT',
      message,
    });
  }
}
