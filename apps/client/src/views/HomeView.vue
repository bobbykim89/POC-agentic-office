<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import {
  createOfficeGame,
  showOfficeDialogue,
  updateOfficePlayerSprite,
  type OfficeGameInstance,
} from '../game/createOfficeGame'
import ChatModal from '../components/ChatModal.vue'
import LinkedInPostTerminal from '../components/LinkedInPostTerminal.vue'
import SpriteStudioModal from '../components/SpriteStudioModal.vue'
import WeeklyReportTerminal from '../components/WeeklyReportTerminal.vue'
import type { LinkedInPostDto } from '@agentic-office/shared-types'
import {
  useSystemStatus,
  type StatusTone,
} from '../composables/useSystemStatus'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const gameRoot = ref<HTMLDivElement | null>(null)
const linkedInPostTerminalOpen = ref(false)
const weeklyReportTerminalOpen = ref(false)
const spriteStudioOpen = ref(false)
const chatModalOpen = ref(false)
const microsoftBanner = ref<{
  tone: 'success' | 'error'
  message: string
} | null>(null)
const showDebugZones = import.meta.env.VITE_DEBUGGING === 'true'
const {
  errorMessage: systemStatusError,
  lastCheckedAt,
  statusItems,
} = useSystemStatus()
let game: OfficeGameInstance | null = null

onMounted(() => {
  if (!gameRoot.value) {
    return
  }

  game = createOfficeGame(gameRoot.value, {
    initialSpriteSheetUrl: authStore.user?.spriteSheetUrl ?? null,
    showDebugZones,
    onOpenLinkedInPostTerminal: () => {
      linkedInPostTerminalOpen.value = true
    },
    onOpenWeeklyReportTerminal: () => {
      weeklyReportTerminalOpen.value = true
    },
    onOpenSpriteStudio: () => {
      spriteStudioOpen.value = true
    },
    onOpenChatRoom: () => {
      chatModalOpen.value = true
    },
    isUiLocked: () =>
      linkedInPostTerminalOpen.value ||
      weeklyReportTerminalOpen.value ||
      spriteStudioOpen.value ||
      chatModalOpen.value,
  })
})

onUnmounted(() => {
  game?.destroy(true)
})

watch(
  () => route.fullPath,
  async () => {
    const microsoftStatus = readSingleQueryParam(route.query.microsoft)
    const account = readSingleQueryParam(route.query.account)
    const message = readSingleQueryParam(route.query.message)
    const open = readSingleQueryParam(route.query.open)

    if (!microsoftStatus && !open) {
      return
    }

    if (microsoftStatus === 'connected') {
      microsoftBanner.value = {
        tone: 'success',
        message: account
          ? `Outlook connected for ${account}. You can keep working in the 515 generator.`
          : 'Outlook connected successfully.',
      }
    } else if (microsoftStatus === 'error') {
      microsoftBanner.value = {
        tone: 'error',
        message: message || 'Outlook connection failed.',
      }
    }

    if (open === 'weekly-report') {
      weeklyReportTerminalOpen.value = true
    }

    await router.replace({ name: 'home' })
  },
  { immediate: true },
)

function handleLinkedInPostComplete(result: LinkedInPostDto) {
  linkedInPostTerminalOpen.value = false
  showOfficeDialogue(game, {
    title: 'LinkedIn Post Generator',
    body: result.post,
  })
}

watch(
  () => authStore.user?.spriteSheetUrl ?? null,
  (nextUrl) => {
    void updateOfficePlayerSprite(game, nextUrl)
  },
)

async function handleLogout() {
  await authStore.logout()
  await router.replace({ name: 'login' })
}

function systemToneClasses(tone: StatusTone) {
  if (tone === 'good') {
    return {
      dot: 'bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.45)]',
      badge: 'bg-emerald-50 text-emerald-900',
    }
  }

  if (tone === 'warn') {
    return {
      dot: 'bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.45)]',
      badge: 'bg-amber-50 text-amber-900',
    }
  }

  if (tone === 'bad') {
    return {
      dot: 'bg-rose-500 shadow-[0_0_14px_rgba(244,63,94,0.45)]',
      badge: 'bg-rose-50 text-rose-900',
    }
  }

  return {
    dot: 'bg-slate-400 shadow-[0_0_14px_rgba(148,163,184,0.35)]',
    badge: 'bg-slate-100 text-slate-700',
  }
}

function formatLastChecked(value: string | null) {
  if (!value) {
    return 'Waiting for first check'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function readSingleQueryParam(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0]
  }

  return null
}
</script>

<template>
  <main
    class="mx-auto grid min-h-screen max-w-[1800px] gap-6 px-4 py-6 md:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)] md:px-8 md:py-8"
  >
    <section
      class="rounded-[28px] border border-slate-900/8 bg-white/75 p-6 shadow-[0_24px_60px_rgba(31,42,55,0.12)] backdrop-blur md:p-8"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <p
            class="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-slate-700"
          >
            Agentic Office
          </p>
          <h1
            class="m-0 max-w-[12ch] text-[clamp(2.4rem,6vw,5rem)] leading-[0.94] font-semibold text-slate-900"
          >
            The Office Quest
          </h1>
        </div>

        <button
          type="button"
          class="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
          @click="handleLogout"
        >
          Logout
        </button>
      </div>

      <div class="mt-8 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-slate-700">
        Signed in as
        <span class="font-semibold">{{ authStore.user?.email }}</span>
      </div>

      <div
        v-if="microsoftBanner"
        class="mt-4 rounded-2xl px-4 py-3 text-sm"
        :class="
          microsoftBanner.tone === 'success'
            ? 'bg-emerald-50 text-emerald-900'
            : 'bg-rose-50 text-rose-900'
        "
      >
        {{ microsoftBanner.message }}
      </div>

      <section class="mt-8 rounded-3xl bg-slate-950 p-5 text-slate-100">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p
              class="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-slate-400"
            >
              System Status
            </p>
            <p class="mt-2 text-lg font-semibold text-white">
              Office services at a glance
            </p>
          </div>
          <p class="text-right text-xs text-slate-400">
            Last checked
            <span class="block text-sm font-semibold text-slate-200">
              {{ formatLastChecked(lastCheckedAt) }}
            </span>
          </p>
        </div>

        <div class="mt-5 space-y-3">
          <article
            v-for="item in statusItems"
            :key="item.id"
            class="flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-white/6 px-4 py-3"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-3">
                <span
                  class="inline-flex h-3 w-3 rounded-full"
                  :class="systemToneClasses(item.tone).dot"
                ></span>
                <p class="text-sm font-semibold text-white">{{ item.label }}</p>
              </div>
              <p class="mt-2 text-sm text-slate-300">{{ item.detail }}</p>
            </div>

            <span
              class="shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]"
              :class="systemToneClasses(item.tone).badge"
            >
              {{ item.value }}
            </span>
          </article>
        </div>

        <p v-if="systemStatusError" class="mt-4 text-sm text-rose-300">
          {{ systemStatusError }}
        </p>
      </section>
    </section>

    <section
      class="rounded-[28px] border border-slate-900/8 bg-white/75 p-4 shadow-[0_24px_60px_rgba(31,42,55,0.12)] backdrop-blur md:p-5"
    >
      <div
        class="mb-4 flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-3 text-slate-100"
      >
        <div>
          <p class="text-[0.7rem] uppercase tracking-[0.22em] text-slate-400">
            Live Scene
          </p>
          <p class="text-lg font-semibold">Office Dashboard Prototype</p>
        </div>
        <span
          class="inline-flex h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.8)]"
        ></span>
      </div>

      <div
        class="relative min-h-[420px] overflow-hidden rounded-3xl bg-[linear-gradient(180deg,#21354a,#111927)] md:min-h-[680px]"
      >
        <div ref="gameRoot" class="h-full min-h-[420px] md:min-h-[680px]"></div>
        <LinkedInPostTerminal
          :is-open="linkedInPostTerminalOpen"
          @close="linkedInPostTerminalOpen = false"
          @complete="handleLinkedInPostComplete"
        />
        <WeeklyReportTerminal
          :is-open="weeklyReportTerminalOpen"
          @close="weeklyReportTerminalOpen = false"
        />
        <SpriteStudioModal
          :is-open="spriteStudioOpen"
          @close="spriteStudioOpen = false"
        />
        <ChatModal :is-open="chatModalOpen" @close="chatModalOpen = false" />
      </div>
    </section>
  </main>
</template>
