<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import type {
  ChatMessagePayload,
  ChatSendDto,
  RealtimeEnvelope,
} from '@agentic-office/shared-types';

type ChatEntry = {
  id: string;
  sender: ChatMessagePayload['sender'];
  message: string;
  createdAt: string;
};

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
const socketStatus = ref<'connecting' | 'connected' | 'disconnected'>('connecting');
const socketId = ref<string>('');
const draft = ref('');
const messages = ref<ChatEntry[]>([]);

let socket: Socket | null = null;

const isConnected = computed(() => socketStatus.value === 'connected');

function appendEnvelope(envelope: RealtimeEnvelope<ChatMessagePayload>) {
  messages.value.push({
    id: envelope.event.id,
    sender: envelope.event.payload.sender,
    message: envelope.event.payload.message,
    createdAt: envelope.event.createdAt,
  });
}

function connectSocket() {
  socket = io(`${backendUrl}/realtime`, {
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    socketStatus.value = 'connected';
    socketId.value = socket?.id ?? '';
  });

  socket.on('disconnect', () => {
    socketStatus.value = 'disconnected';
  });

  socket.on('system:welcome', (envelope: RealtimeEnvelope<ChatMessagePayload>) => {
    appendEnvelope(envelope);
  });

  socket.on('system:presence', (envelope: RealtimeEnvelope<ChatMessagePayload>) => {
    appendEnvelope(envelope);
  });

  socket.on('chat:message', (envelope: RealtimeEnvelope<ChatMessagePayload>) => {
    appendEnvelope(envelope);
  });

  socket.on('chat:error', (envelope: RealtimeEnvelope<ChatMessagePayload>) => {
    appendEnvelope(envelope);
  });
}

function sendMessage() {
  const message = draft.value.trim();
  if (!socket || !message) {
    return;
  }

  const payload: ChatSendDto = { message };
  socket.emit('chat:send', payload);
  draft.value = '';
}

onMounted(() => {
  connectSocket();
});

onUnmounted(() => {
  socket?.disconnect();
  socket = null;
});
</script>

<template>
  <section class="rounded-3xl border border-slate-900/8 bg-slate-50 p-4">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
      <div>
        <p class="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-slate-500">
          Realtime Test
        </p>
        <h2 class="text-lg font-semibold text-slate-900">Socket.IO Chatbot Box</h2>
      </div>

      <div class="text-right text-xs text-slate-500">
        <p>
          Status:
          <span
            class="font-semibold"
            :class="isConnected ? 'text-emerald-600' : 'text-amber-600'"
          >
            {{ socketStatus }}
          </span>
        </p>
        <p class="mt-1 max-w-[240px] truncate">Client: {{ socketId || 'pending' }}</p>
      </div>
    </div>

    <div class="mt-4 space-y-3">
      <div class="max-h-72 space-y-3 overflow-y-auto rounded-2xl bg-white p-3 shadow-inner">
        <div
          v-for="entry in messages"
          :key="entry.id"
          class="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6"
          :class="
            entry.sender === 'user'
              ? 'ml-auto bg-slate-900 text-white'
              : entry.sender === 'assistant'
                ? 'bg-sky-100 text-slate-900'
                : 'bg-amber-100 text-slate-900'
          "
        >
          <p class="text-[0.65rem] font-bold uppercase tracking-[0.18em] opacity-60">
            {{ entry.sender }}
          </p>
          <p class="mt-1">{{ entry.message }}</p>
        </div>

        <p v-if="messages.length === 0" class="text-sm text-slate-500">
          Waiting for socket connection...
        </p>
      </div>

      <form class="flex gap-3" @submit.prevent="sendMessage">
        <input
          v-model="draft"
          type="text"
          placeholder="Send a test message to the NestJS gateway"
          class="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
        />
        <button
          type="submit"
          class="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          :disabled="!isConnected || !draft.trim()"
        >
          Send
        </button>
      </form>
    </div>
  </section>
</template>
