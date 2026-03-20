<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { createOfficeGame, type OfficeGameInstance } from './game/createOfficeGame';
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
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">Agentic Office</p>
      <h1>Phaser + Vue client inside a Turborepo workspace.</h1>
      <p class="lede">
        This starter pairs a Vue 3 shell with a small Phaser scene and shared
        TypeScript contracts from the workspace package.
      </p>
      <pre class="event-card">{{ JSON.stringify(featuredEvent, null, 2) }}</pre>
    </section>

    <section class="game-panel">
      <div ref="gameRoot" class="game-root"></div>
    </section>
  </main>
</template>
