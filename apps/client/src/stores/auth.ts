import { defineStore } from 'pinia'
import { apiRequest, publicRequest } from '../lib/api-client'

const REFRESH_TOKEN_STORAGE_KEY = 'agentic-office.auth.refresh-token'

export interface AuthUser {
  id: string
  username: string
  email: string
  displayName: string | null
  spriteSheetUrl: string | null
}

interface AuthTokens {
  accessToken: string
  refreshToken: string
}

interface AuthResponse {
  tokens: AuthTokens
  user: AuthUser
}

interface LoginCredentials {
  email: string
  password: string
}

interface SignupPayload extends LoginCredentials {
  username: string
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    accessToken: null as string | null,
    isLoading: false,
    initialized: false,
    initPromise: null as Promise<void> | null,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken),
  },
  actions: {
    async login(credentials: LoginCredentials) {
      this.isLoading = true
      try {
        const response = await publicRequest<AuthResponse>('/auth/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(credentials),
        })

        this.setSession(response)
      } finally {
        this.isLoading = false
      }
    },

    async signup(payload: SignupPayload) {
      this.isLoading = true
      try {
        const response = await publicRequest<AuthResponse>('/auth/signup', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        this.setSession(response)
      } finally {
        this.isLoading = false
      }
    },

    async logout() {
      try {
        await apiRequest<{ loggedOut: true }>('/auth/logout', {
          method: 'POST',
        })
      } catch {
        // Clear local auth state even if backend logout fails.
      } finally {
        this.clearSession()
      }
    },

    async refreshAccessToken() {
      const refreshToken = readRefreshToken()
      if (!refreshToken) {
        this.clearSession()
        return null
      }

      try {
        const tokens = await publicRequest<AuthTokens>('/auth/refresh', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        })
        this.accessToken = tokens.accessToken
        persistRefreshToken(tokens.refreshToken)
        return tokens.accessToken
      } catch {
        this.clearSession()
        return null
      }
    },

    async fetchCurrentUser() {
      const user = await apiRequest<AuthUser>('/auth/me')
      this.user = user
      return user
    },

    async initialize() {
      if (this.initialized) {
        return
      }

      if (this.initPromise) {
        return this.initPromise
      }

      this.initPromise = (async () => {
        this.isLoading = true
        try {
          const accessToken = await this.refreshAccessToken()
          if (!accessToken) {
            this.clearSession()
            return
          }

          await this.fetchCurrentUser()
        } catch {
          this.clearSession()
        } finally {
          this.initialized = true
          this.isLoading = false
          this.initPromise = null
        }
      })()

      return this.initPromise
    },

    setSession(response: AuthResponse) {
      this.accessToken = response.tokens.accessToken
      this.user = response.user
      this.initialized = true
      persistRefreshToken(response.tokens.refreshToken)
    },

    setCurrentUser(user: AuthUser) {
      this.user = user
      this.initialized = true
    },

    clearSession() {
      this.accessToken = null
      this.user = null
      this.initialized = true
      clearRefreshToken()
    },
  },
})

function readRefreshToken() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
}

function persistRefreshToken(refreshToken: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken)
}

function clearRefreshToken() {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
}
