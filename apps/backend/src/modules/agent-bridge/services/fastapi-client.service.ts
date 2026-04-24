import { Injectable } from '@nestjs/common'
import type {
  AINewsDto,
  ConnectedMicrosoftAccountDto,
  LinkedInPostDto,
  LinkedInPostRequestDto,
  WeeklyReportDraftDto,
  WeeklyReportDraftRequestDto,
  WeeklyReportHistoryDto,
  WeeklyReportMessageDto,
  WeeklyReportReviseRequestDto,
  WeeklyReportSaveDraftDto,
  WeeklyReportSaveDraftRequestDto,
  WeeklyReportSendDto,
  WeeklyReportSendRequestDto,
} from '@agentic-office/shared-types'
import type { MicrosoftAuthStartDto } from '../dto/microsoft-auth-start.dto'
import type {
  SpriteSheetRequestDto,
  SpriteSheetUploadInput,
} from '../dto/sprite-sheet-request.dto'
import type { SpriteSheetResponseDto } from '../dto/sprite-sheet-response.dto'
import {
  AgentConnectionFailedException,
  AgentRequestFailedException,
  AgentTimeoutException,
  AgentUpstreamFailedException,
} from '../errors/agent-bridge.exception'
import { AgentBridgeLogsRepository } from '../repositories/agent-logs.repository'

@Injectable()
export class FastapiClientService {
  private readonly baseUrl =
    process.env.AI_AGENTS_URL ?? 'http://localhost:8001'
  private readonly timeoutMs = Number(process.env.AI_AGENTS_TIMEOUT_MS ?? 20000)

  constructor(
    private readonly agentBridgeLogsRepository: AgentBridgeLogsRepository,
  ) {}

  createLinkedinPost(payload: LinkedInPostRequestDto) {
    return this.request<LinkedInPostDto>('/agents/linkedin-post', {
      method: 'POST',
      jsonBody: payload,
      requestPayload: payload,
    })
  }

  createSpriteSheet(payload: SpriteSheetUploadInput) {
    const formData = new FormData()
    if (payload.description?.trim()) {
      formData.set('description', payload.description.trim())
    }

    if (payload.imageBuffer?.length) {
      const mimeType = payload.imageMimeType?.trim() || 'image/png'
      formData.set(
        'image',
        new Blob([Uint8Array.from(payload.imageBuffer)], { type: mimeType }),
        payload.imageFilename?.trim() || `upload.${this.extensionForMimeType(mimeType)}`,
      )
    }

    return this.request<SpriteSheetResponseDto>('/agents/sprite-sheet', {
      method: 'POST',
      body: formData,
      requestPayload: payload,
      timeoutMs: this.timeoutMs * 3,
    })
  }

  getAiNews() {
    return this.request<AINewsDto>('/agents/ai-news', {
      method: 'GET',
      requestPayload: null,
    })
  }

  startWeeklyReportMicrosoftAuth() {
    return this.request<MicrosoftAuthStartDto>(
      '/agents/weekly-report/microsoft/auth/start',
      {
        method: 'GET',
        requestPayload: null,
      },
    )
  }

  finishWeeklyReportMicrosoftAuth(query: { state: string; code: string }) {
    return this.request<ConnectedMicrosoftAccountDto>(
      '/agents/weekly-report/microsoft/auth/callback',
      {
        method: 'GET',
        query,
        requestPayload: query,
      },
    )
  }

  getWeeklyReportMicrosoftAccounts() {
    return this.request<ConnectedMicrosoftAccountDto[]>(
      '/agents/weekly-report/microsoft/accounts',
      {
        method: 'GET',
        requestPayload: null,
      },
    )
  }

  getWeeklyReportHistory(query: {
    account_email: string
    query?: string
    max_results?: number
  }) {
    return this.request<WeeklyReportHistoryDto>(
      '/agents/weekly-report/history',
      {
        method: 'GET',
        query,
        requestPayload: query,
      },
    )
  }

  createWeeklyReportDraft(payload: WeeklyReportDraftRequestDto) {
    return this.request<WeeklyReportDraftDto>('/agents/weekly-report/draft', {
      method: 'POST',
      jsonBody: payload,
      requestPayload: payload,
    })
  }

  createWeeklyReportDraftFromContext(payload: {
    account_email: string
    weekly_summary: string
    query?: string
    source_examples: WeeklyReportMessageDto[]
    last_week_email: WeeklyReportMessageDto | null
    recipient_override?: string
    subject_override?: string
  }) {
    return this.request<WeeklyReportDraftDto>(
      '/agents/weekly-report/draft-from-context',
      {
        method: 'POST',
        jsonBody: payload,
        requestPayload: payload,
      },
    )
  }

  reviseWeeklyReport(payload: WeeklyReportReviseRequestDto) {
    return this.request<WeeklyReportDraftDto>('/agents/weekly-report/revise', {
      method: 'POST',
      jsonBody: payload,
      requestPayload: payload,
    })
  }

  sendWeeklyReport(payload: WeeklyReportSendRequestDto) {
    return this.request<WeeklyReportSendDto>('/agents/weekly-report/send', {
      method: 'POST',
      jsonBody: payload,
      requestPayload: payload,
    })
  }

  saveWeeklyReportDraft(payload: WeeklyReportSaveDraftRequestDto) {
    return this.request<WeeklyReportSaveDraftDto>(
      '/agents/weekly-report/save-draft',
      {
        method: 'POST',
        jsonBody: payload,
        requestPayload: payload,
      },
    )
  }

  private async request<TResponse>(
    path: string,
    input: {
      method: 'GET' | 'POST'
      query?: Record<string, string | number | boolean | undefined>
      jsonBody?: unknown
      body?: BodyInit
      requestPayload?: unknown
      timeoutMs?: number
    },
  ): Promise<TResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      input.timeoutMs ?? this.timeoutMs,
    )
    const startedAt = Date.now()
    const logRequestPayload = {
      endpoint: path,
      method: input.method,
      query: input.query ?? null,
      payload: input.requestPayload ?? null,
    }

    try {
      const url = new URL(path, this.baseUrl)
      if (input.query) {
        for (const [key, value] of Object.entries(input.query)) {
          if (value === undefined || value === null) {
            continue
          }
          url.searchParams.set(key, String(value))
        }
      }

      const response = await fetch(url, {
        method: input.method,
        headers: input.jsonBody
          ? {
              'content-type': 'application/json',
            }
          : undefined,
        body: input.jsonBody ? JSON.stringify(input.jsonBody) : input.body,
        signal: controller.signal,
      })

      if (!response.ok) {
        throw await this.toUpstreamException(response)
      }

      const data = (await response.json()) as TResponse
      await this.logRequest({
        eventType: 'agent_bridge.request.succeeded',
        requestPayload: logRequestPayload,
        responsePayload: {
          endpoint: path,
          success: true,
          responseTimeMs: Date.now() - startedAt,
        },
        message: `Agent bridge request succeeded for ${input.method} ${path}.`,
      })

      return data
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new AgentTimeoutException()
        await this.logFailure(
          path,
          input.method,
          logRequestPayload,
          startedAt,
          timeoutError,
        )
        throw timeoutError
      }

      if (
        error instanceof AgentRequestFailedException ||
        error instanceof AgentUpstreamFailedException ||
        error instanceof AgentTimeoutException
      ) {
        await this.logFailure(
          path,
          input.method,
          logRequestPayload,
          startedAt,
          error,
        )
        throw error
      }

      if (error instanceof TypeError) {
        const connectionError = new AgentConnectionFailedException()
        await this.logFailure(
          path,
          input.method,
          logRequestPayload,
          startedAt,
          connectionError,
        )
        throw connectionError
      }

      await this.logFailure(
        path,
        input.method,
        logRequestPayload,
        startedAt,
        error,
      )
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  private async toUpstreamException(response: Response) {
    const message = await this.extractUpstreamMessage(response)

    if (response.status === 400) {
      return new AgentRequestFailedException(message, {
        status: response.status,
      })
    }

    return new AgentUpstreamFailedException(message, {
      status: response.status,
    })
  }

  private async extractUpstreamMessage(response: Response) {
    try {
      const payload = (await response.json()) as { detail?: unknown }
      if (typeof payload.detail === 'string' && payload.detail.trim()) {
        return payload.detail.trim()
      }
    } catch {}

    if (response.status === 400) {
      return 'The AI agent request was rejected.'
    }

    return 'The AI agent service failed to process the request.'
  }

  private extensionForMimeType(mimeType: string) {
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      return 'jpg'
    }
    if (mimeType.includes('webp')) {
      return 'webp'
    }
    return 'png'
  }

  private async logFailure(
    path: string,
    method: 'GET' | 'POST',
    requestPayload: Record<string, unknown>,
    startedAt: number,
    error: unknown,
  ) {
    const details = this.extractErrorDetails(error)
    await this.logRequest({
      eventType: 'agent_bridge.request.failed',
      requestPayload,
      responsePayload: {
        endpoint: path,
        success: false,
        responseTimeMs: Date.now() - startedAt,
      },
      errorCode: details.code,
      message: `Agent bridge request failed for ${method} ${path}: ${details.message}`,
    })
  }

  private extractErrorDetails(error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof error.response === 'object' &&
      error.response !== null
    ) {
      const response = error.response as { message?: unknown; code?: unknown }
      return {
        code:
          typeof response.code === 'string'
            ? response.code
            : 'AGENT_REQUEST_FAILED',
        message:
          typeof response.message === 'string'
            ? response.message
            : error instanceof Error
              ? error.message
              : 'Agent bridge request failed.',
      }
    }

    return {
      code: 'AGENT_REQUEST_FAILED',
      message:
        error instanceof Error ? error.message : 'Agent bridge request failed.',
    }
  }

  private async logRequest(input: {
    eventType: string
    requestPayload: unknown
    responsePayload: unknown
    errorCode?: string
    message: string
  }) {
    try {
      await this.agentBridgeLogsRepository.create({
        eventType: input.eventType,
        requestPayload: input.requestPayload,
        responsePayload: input.responsePayload,
        errorCode: input.errorCode ?? null,
        message: input.message,
      })
    } catch {}
  }
}
