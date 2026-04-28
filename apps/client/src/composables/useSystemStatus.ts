import { computed, onMounted, onUnmounted, ref } from 'vue'
import { publicRequest } from '../lib/api-client'
import { useAuthStore } from '../stores/auth'

type BackendHealth = {
  status: 'ok' | 'degraded' | 'down'
  service: 'backend'
  timestamp: string
}

type DatabaseHealth = {
  connected: boolean
  dialect: 'postgresql'
  drizzle: true
  urlConfigured: boolean
}

export type StatusTone = 'good' | 'warn' | 'bad' | 'idle'

export type StatusItem = {
  id: string
  label: string
  tone: StatusTone
  value: string
  detail: string
}

const HEALTH_POLL_INTERVAL_MS = 30_000

export function useSystemStatus() {
  const authStore = useAuthStore()
  const backendHealth = ref<BackendHealth | null>(null)
  const databaseHealth = ref<DatabaseHealth | null>(null)
  const loading = ref(true)
  const errorMessage = ref('')
  const lastCheckedAt = ref<string | null>(null)
  let pollTimer: number | null = null

  const authStatus = computed<StatusItem>(() => {
    if (authStore.isLoading && !authStore.initialized) {
      return {
        id: 'auth',
        label: 'Auth',
        tone: 'warn',
        value: 'Checking',
        detail: 'Verifying your session',
      }
    }

    if (authStore.isAuthenticated && authStore.user) {
      return {
        id: 'auth',
        label: 'Auth',
        tone: 'good',
        value: 'Authenticated',
        detail: authStore.user.email,
      }
    }

    return {
      id: 'auth',
      label: 'Auth',
      tone: 'bad',
      value: 'Signed out',
      detail: 'Login required for office tools',
    }
  })

  const statusItems = computed<StatusItem[]>(() => {
    const backendItem: StatusItem = backendHealth.value
      ? {
          id: 'backend',
          label: 'Backend API',
          tone: backendHealth.value.status === 'ok' ? 'good' : 'bad',
          value: backendHealth.value.status === 'ok' ? 'Online' : backendHealth.value.status,
          detail: `Backend responded at ${formatTime(backendHealth.value.timestamp)}`,
        }
      : {
          id: 'backend',
          label: 'Backend API',
          tone: loading.value ? 'warn' : 'bad',
          value: loading.value ? 'Checking' : 'Unavailable',
          detail: errorMessage.value || 'Waiting for health check',
        }

    const databaseItem: StatusItem = databaseHealth.value
      ? {
          id: 'database',
          label: 'Database',
          tone:
            databaseHealth.value.connected && databaseHealth.value.urlConfigured
              ? 'good'
              : 'bad',
          value:
            databaseHealth.value.connected && databaseHealth.value.urlConfigured
              ? 'Configured'
              : 'Unavailable',
          detail: databaseHealth.value.urlConfigured
            ? 'Postgres pool is configured on the backend'
            : 'DATABASE_URL is not configured',
        }
      : {
          id: 'database',
          label: 'Database',
          tone: loading.value ? 'warn' : 'idle',
          value: loading.value ? 'Checking' : 'Unknown',
          detail: 'Reported by backend health endpoint',
        }

    const realtimeItem: StatusItem = {
      id: 'realtime',
      label: 'Realtime',
      tone: 'idle',
      value: 'On demand',
      detail: 'Socket connects when chat is opened',
    }

    return [backendItem, databaseItem, realtimeItem, authStatus.value]
  })

  async function refreshStatus() {
    try {
      const [backend, database] = await Promise.all([
        publicRequest<BackendHealth>('/health'),
        publicRequest<DatabaseHealth>('/health/database'),
      ])
      backendHealth.value = backend
      databaseHealth.value = database
      errorMessage.value = ''
    } catch (error) {
      backendHealth.value = null
      databaseHealth.value = null
      errorMessage.value =
        error instanceof Error ? error.message : 'Health check failed.'
    } finally {
      loading.value = false
      lastCheckedAt.value = new Date().toISOString()
    }
  }

  onMounted(() => {
    void refreshStatus()
    pollTimer = window.setInterval(() => {
      void refreshStatus()
    }, HEALTH_POLL_INTERVAL_MS)
  })

  onUnmounted(() => {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer)
      pollTimer = null
    }
  })

  return {
    errorMessage,
    lastCheckedAt,
    refreshStatus,
    statusItems,
  }
}

function formatTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}
