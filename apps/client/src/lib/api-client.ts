const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ??
  import.meta.env.VITE_BACKEND_API_URL ??
  'http://localhost:3000'

type AccessTokenGetter = () => string | null
type RefreshHandler = () => Promise<string | null>

type RequestOptions = RequestInit & {
  skipAuth?: boolean
  skipRetry?: boolean
}

let getAccessToken: AccessTokenGetter = () => null
let handleRefresh: RefreshHandler | null = null
let refreshPromise: Promise<string | null> | null = null

export function configureApiClient(input: {
  getAccessToken: AccessTokenGetter
  refreshAccessToken: RefreshHandler
}) {
  getAccessToken = input.getAccessToken
  handleRefresh = input.refreshAccessToken
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>(path, options)
}

export async function publicRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>(path, {
    ...options,
    skipAuth: true,
    skipRetry: true,
  })
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const { skipAuth = false, skipRetry = false, headers, ...init } = options
  const mergedHeaders = new Headers(headers)

  if (!skipAuth) {
    const accessToken = getAccessToken()
    if (accessToken) {
      mergedHeaders.set('Authorization', `Bearer ${accessToken}`)
    }
  }

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: mergedHeaders,
    credentials: 'include',
  })

  if (response.status === 401 && !skipRetry) {
    const refreshedToken = await refreshAccessToken()
    if (refreshedToken) {
      return request<T>(path, {
        ...options,
        skipRetry: true,
      })
    }
  }

  const payload = await parseJson(response)

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, response.status))
  }

  return unwrapData<T>(payload)
}

async function refreshAccessToken() {
  if (!handleRefresh) {
    return null
  }

  if (!refreshPromise) {
    refreshPromise = handleRefresh().finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}

async function parseJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function extractErrorMessage(payload: unknown, status: number) {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'ok' in payload &&
    payload.ok === false &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message
  }

  return `Request failed with status ${status}.`
}

function unwrapData<T>(payload: unknown): T {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'ok' in payload &&
    payload.ok === true &&
    'data' in payload
  ) {
    return payload.data as T
  }

  return payload as T
}
