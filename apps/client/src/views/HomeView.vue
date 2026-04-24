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
import RealtimeChatBox from '../components/RealtimeChatBox.vue'
import SpriteStudioModal from '../components/SpriteStudioModal.vue'
import WeeklyReportTerminal from '../components/WeeklyReportTerminal.vue'
import type { ApiEvent, LinkedInPostDto } from '@agentic-office/shared-types'
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
const microsoftBanner = ref<{ tone: 'success' | 'error'; message: string } | null>(null)
let game: OfficeGameInstance | null = null

const featuredEvent: ApiEvent = {
  id: 'evt_client_boot',
  type: 'client.boot',
  payload: {
    message: 'Client initialized',
  },
  createdAt: new Date().toISOString(),
}

onMounted(() => {
  if (!gameRoot.value) {
    return
  }

  game = createOfficeGame(gameRoot.value, {
    initialSpriteSheetUrl: authStore.user?.spriteSheetUrl ?? null,
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
          <p class="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-slate-700">
            Agentic Office
          </p>
          <h1 class="m-0 max-w-[12ch] text-[clamp(2.4rem,6vw,5rem)] leading-[0.94] font-semibold text-slate-900">
            Phaser + Vue client inside a Turborepo workspace.
          </h1>
          <p class="mt-5 max-w-[48ch] text-base leading-7 text-slate-700">
            This starter pairs a Vue 3 shell with a small Phaser scene and shared
            TypeScript contracts from the workspace package.
          </p>
        </div>

        <button
          type="button"
          class="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
          @click="authStore.logout()"
        >
          Logout
        </button>
      </div>

      <div class="mt-8 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-slate-700">
        Signed in as <span class="font-semibold">{{ authStore.user?.email }}</span>
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

      <div class="mt-8 grid gap-3 sm:grid-cols-3">
        <article class="rounded-2xl bg-slate-900 px-4 py-3 text-slate-50">
          <p class="text-[0.7rem] uppercase tracking-[0.22em] text-slate-400">UI</p>
          <p class="mt-2 text-lg font-semibold">Vue 3 + Tailwind</p>
        </article>
        <article class="rounded-2xl bg-amber-300 px-4 py-3 text-slate-900">
          <p class="text-[0.7rem] uppercase tracking-[0.22em] text-slate-700">Game</p>
          <p class="mt-2 text-lg font-semibold">Phaser canvas</p>
        </article>
        <article class="rounded-2xl bg-sky-200 px-4 py-3 text-slate-900">
          <p class="text-[0.7rem] uppercase tracking-[0.22em] text-slate-700">Shared</p>
          <p class="mt-2 text-lg font-semibold">Workspace types</p>
        </article>
      </div>

      <pre
        class="mt-8 overflow-auto rounded-3xl bg-slate-950 p-5 text-sm leading-6 text-slate-100"
      >{{ JSON.stringify(featuredEvent, null, 2) }}</pre>
    </section>

    <section
      class="rounded-[28px] border border-slate-900/8 bg-white/75 p-4 shadow-[0_24px_60px_rgba(31,42,55,0.12)] backdrop-blur md:p-5"
    >
      <div
        class="mb-4 flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-3 text-slate-100"
      >
        <div>
          <p class="text-[0.7rem] uppercase tracking-[0.22em] text-slate-400">Live Scene</p>
          <p class="text-lg font-semibold">Office Dashboard Prototype</p>
        </div>
        <span class="inline-flex h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.8)]"></span>
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
        <ChatModal
          :is-open="chatModalOpen"
          @close="chatModalOpen = false"
        />
      </div>

      <div class="mt-4">
        <RealtimeChatBox />
      </div>
    </section>
  </main>
</template>
