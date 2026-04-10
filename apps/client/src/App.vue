<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { createOfficeGame, type OfficeGameInstance } from './game/createOfficeGame';
import RealtimeChatBox from './components/RealtimeChatBox.vue';
import type { ApiEvent } from '@agentic-office/shared-types';

const gameRoot = ref<HTMLDivElement | null>(null);
let game: OfficeGameInstance | null = null;

const featuredEvent: ApiEvent = {
  id: 'evt_client_boot',
  type: 'client.boot',
  payload: {
    message: 'Client initialized',
  },
  createdAt: new Date().toISOString(),
};

onMounted(() => {
  if (!gameRoot.value) {
    return;
  }

  game = createOfficeGame(gameRoot.value);
});

onUnmounted(() => {
  game?.destroy(true);
});
</script>

<template>
  <main
    class="mx-auto grid min-h-screen max-w-[1800px] gap-6 px-4 py-6 md:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)] md:px-8 md:py-8"
  >
    <section
      class="rounded-[28px] border border-slate-900/8 bg-white/75 p-6 shadow-[0_24px_60px_rgba(31,42,55,0.12)] backdrop-blur md:p-8"
    >
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
        ref="gameRoot"
        class="min-h-[420px] overflow-hidden rounded-3xl bg-[linear-gradient(180deg,#21354a,#111927)] md:min-h-[680px]"
      ></div>

      <div class="mt-4">
        <RealtimeChatBox />
      </div>
    </section>
  </main>
</template>
