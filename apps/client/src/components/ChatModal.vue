<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { apiRequest } from '../lib/api-client'
import { useAuthStore } from '../stores/auth'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

interface UserDirectoryItem {
  id: string
  username: string
  displayName: string | null
  spriteSheetUrl: string | null
}

interface ChatUser {
  id: string
  username: string
  displayName: string | null
  spriteSheetUrl: string | null
}

interface ChatMessage {
  id: string
  conversationId: string
  sender: ChatUser | null
  content: string
  messageType: 'text' | 'system' | 'agent'
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

interface ChatConversation {
  id: string
  type: 'direct' | 'group'
  title: string | null
  roomId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  lastMessageAt: string | null
  participants: ChatUser[]
  latestMessage: ChatMessage | null
  unreadCount: number
}

interface PresenceState {
  userId: string
  status: 'online' | 'offline'
  socketCount: number
  currentRoomId: string | null
  lastSeenAt: string
}

interface PresenceSnapshotPayload {
  self?: PresenceState
  users?: PresenceState[]
  user?: PresenceState
}

interface ChatMessageEnvelope {
  conversationId: string
  message: ChatMessage
}

interface ChatAckPayload {
  requestId: string | null
  message: ChatMessage
}

interface WsEnvelope<TData = Record<string, unknown>> {
  event: string
  ok: boolean
  data?: TData
  error?: {
    code: string
    message: string
  }
}

type DirectoryEntry = {
  user: UserDirectoryItem
  conversation: ChatConversation | null
}

const backendUrl =
  import.meta.env.VITE_BACKEND_URL ??
  import.meta.env.VITE_BACKEND_API_URL ??
  'http://localhost:3000'

const authStore = useAuthStore()
const directoryUsers = ref<UserDirectoryItem[]>([])
const directConversations = ref<ChatConversation[]>([])
const selectedUserId = ref('')
const messagesByConversationId = ref<Record<string, ChatMessage[]>>({})
const presenceByUserId = ref<Record<string, PresenceState>>({})
const draft = ref('')
const loading = ref(false)
const loadingMessages = ref(false)
const sending = ref(false)
const errorMessage = ref('')
const socketStatus = ref<'connecting' | 'connected' | 'disconnected'>('disconnected')
const messageViewport = ref<HTMLElement | null>(null)

let socket: Socket | null = null
const pendingRequestIds = new Set<string>()

const directoryEntries = computed<DirectoryEntry[]>(() => {
  const conversationByOtherUserId = new Map<string, ChatConversation>()

  for (const conversation of directConversations.value) {
    const otherParticipant = findOtherParticipant(conversation)
    if (otherParticipant) {
      conversationByOtherUserId.set(otherParticipant.id, conversation)
    }
  }

  return [...directoryUsers.value]
    .map((user) => ({
      user,
      conversation: conversationByOtherUserId.get(user.id) ?? null,
    }))
    .sort((left, right) => {
      const leftLast = left.conversation?.lastMessageAt ?? ''
      const rightLast = right.conversation?.lastMessageAt ?? ''

      if (left.conversation && right.conversation && leftLast !== rightLast) {
        return rightLast.localeCompare(leftLast)
      }

      if (left.conversation && !right.conversation) {
        return -1
      }

      if (!left.conversation && right.conversation) {
        return 1
      }

      return displayNameForUser(left.user).localeCompare(displayNameForUser(right.user))
    })
})

const selectedEntry = computed(() => {
  return directoryEntries.value.find((entry) => entry.user.id === selectedUserId.value) ?? null
})

const activeConversationId = computed(() => selectedEntry.value?.conversation?.id ?? null)

const activeMessages = computed(() => {
  const conversationId = activeConversationId.value
  if (!conversationId) {
    return []
  }

  return messagesByConversationId.value[conversationId] ?? []
})

const canSendMessage = computed(() => {
  return Boolean(selectedEntry.value) && !sending.value && draft.value.trim().length > 0
})

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen) {
      await initializeModal()
      return
    }

    teardownRealtime()
    resetDraftState()
  },
)

watch(
  () => selectedUserId.value,
  async (nextUserId) => {
    if (!props.isOpen || !nextUserId) {
      return
    }

    await loadSelectedConversationMessages()
  },
)

watch(
  () => activeMessages.value.length,
  async () => {
    await nextTick()
    scrollMessagesToBottom()
  },
)

async function initializeModal() {
  loading.value = true
  errorMessage.value = ''

  try {
    await Promise.all([loadDirectory(), loadConversations()])
    if (!selectedUserId.value && directoryEntries.value[0]) {
      selectedUserId.value = directoryEntries.value[0].user.id
    }
    connectRealtime()
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function loadDirectory() {
  directoryUsers.value = await apiRequest<UserDirectoryItem[]>('/users')
}

async function loadConversations(preferredUserId?: string, preferredConversationId?: string) {
  const conversations = await apiRequest<ChatConversation[]>('/chat/conversations')
  directConversations.value = conversations.filter((conversation) => conversation.type === 'direct')

  if (preferredUserId) {
    selectedUserId.value = preferredUserId
  } else if (!selectedUserId.value && directoryEntries.value[0]) {
    selectedUserId.value = directoryEntries.value[0].user.id
  }

  if (preferredConversationId) {
    await loadConversationMessages(preferredConversationId, true)
  }
}

async function loadSelectedConversationMessages(force = false) {
  const conversationId = activeConversationId.value
  if (!conversationId) {
    return
  }

  await loadConversationMessages(conversationId, force)
}

async function loadConversationMessages(conversationId: string, force = false) {
  if (!force && messagesByConversationId.value[conversationId]) {
    return
  }

  loadingMessages.value = true

  try {
    const messages = await apiRequest<ChatMessage[]>(
      `/chat/conversations/${conversationId}/messages?limit=100`,
    )
    messagesByConversationId.value = {
      ...messagesByConversationId.value,
      [conversationId]: messages,
    }
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loadingMessages.value = false
  }
}

function connectRealtime() {
  if (socket || !authStore.accessToken) {
    return
  }

  socketStatus.value = 'connecting'
  socket = io(`${backendUrl}/realtime`, {
    transports: ['websocket'],
    auth: {
      token: authStore.accessToken,
    },
  })

  socket.on('connect', () => {
    socketStatus.value = 'connected'
    socket?.emit('presence:join')
  })

  socket.on('disconnect', () => {
    socketStatus.value = 'disconnected'
  })

  socket.on('presence:update', (envelope: WsEnvelope<PresenceSnapshotPayload>) => {
    if (!envelope.ok || !envelope.data) {
      return
    }

    const nextPresence = { ...presenceByUserId.value }

    for (const presence of envelope.data.users ?? []) {
      nextPresence[presence.userId] = presence
    }

    if (envelope.data.self) {
      nextPresence[envelope.data.self.userId] = envelope.data.self
    }

    if (envelope.data.user) {
      nextPresence[envelope.data.user.userId] = envelope.data.user
    }

    presenceByUserId.value = nextPresence
  })

  socket.on('chat:message', (envelope: WsEnvelope<ChatMessageEnvelope>) => {
    if (!envelope.ok || !envelope.data) {
      return
    }

    appendMessage(envelope.data.message)
    void loadConversations(selectedUserId.value, envelope.data.message.conversationId)
  })

  socket.on('chat:ack', (envelope: WsEnvelope<ChatAckPayload>) => {
    if (!envelope.ok || !envelope.data) {
      return
    }

    if (envelope.data.requestId) {
      pendingRequestIds.delete(envelope.data.requestId)
    }

    sending.value = pendingRequestIds.size > 0
    appendMessage(envelope.data.message)
    void loadConversations(selectedUserId.value, envelope.data.message.conversationId)
  })

  socket.on('error', (envelope: WsEnvelope) => {
    if (!envelope.ok && envelope.error) {
      errorMessage.value = envelope.error.message
      pendingRequestIds.clear()
      sending.value = false
    }
  })
}

function teardownRealtime() {
  socket?.disconnect()
  socket = null
  socketStatus.value = 'disconnected'
  presenceByUserId.value = {}
  pendingRequestIds.clear()
  sending.value = false
}

function resetDraftState() {
  draft.value = ''
  errorMessage.value = ''
  loadingMessages.value = false
}

function selectUser(userId: string) {
  selectedUserId.value = userId
  errorMessage.value = ''
}

async function sendMessage() {
  const entry = selectedEntry.value
  const content = draft.value.trim()
  if (!entry || !content) {
    return
  }

  errorMessage.value = ''

  if (socket && socket.connected) {
    const requestId = generateRequestId()
    pendingRequestIds.add(requestId)
    sending.value = true
    draft.value = ''

    socket.emit('chat:send', {
      requestId,
      conversationId: entry.conversation?.id ?? undefined,
      directRecipientUserId: entry.conversation ? undefined : entry.user.id,
      content,
    })

    return
  }

  sending.value = true

  try {
    const message = await apiRequest<ChatMessage>('/chat/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: entry.conversation?.id ?? undefined,
        directRecipientUserId: entry.conversation ? undefined : entry.user.id,
        content,
      }),
    })

    draft.value = ''
    appendMessage(message)
    await loadConversations(entry.user.id, message.conversationId)
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    sending.value = false
  }
}

function appendMessage(message: ChatMessage) {
  const current = messagesByConversationId.value[message.conversationId] ?? []
  if (current.some((entry) => entry.id === message.id)) {
    return
  }

  messagesByConversationId.value = {
    ...messagesByConversationId.value,
    [message.conversationId]: [...current, message],
  }
}

function isUserOnline(userId: string) {
  const presence = presenceByUserId.value[userId]
  return Boolean(presence && presence.status === 'online' && presence.socketCount > 0)
}

function findOtherParticipant(conversation: ChatConversation) {
  return (
    conversation.participants.find((participant) => participant.id !== authStore.user?.id) ?? null
  )
}

function displayNameForUser(user: Pick<UserDirectoryItem, 'displayName' | 'username'>) {
  return user.displayName?.trim() || user.username
}

function displayNameForMessageAuthor(user: ChatUser | null) {
  if (!user) {
    return 'System'
  }

  if (user.id === authStore.user?.id) {
    return 'You'
  }

  return displayNameForUser(user)
}

function formatTimestamp(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function generateRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function scrollMessagesToBottom() {
  if (!messageViewport.value) {
    return
  }

  messageViewport.value.scrollTop = messageViewport.value.scrollHeight
}

function closeModal() {
  emit('close')
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) {
    return
  }

  event.preventDefault()

  if (canSendMessage.value) {
    void sendMessage()
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Chat request failed.'
}
</script>

<template>
  <div
    v-if="isOpen"
    class="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(7,16,28,0.78)] p-3 md:p-6"
  >
    <section
      class="relative flex h-full max-h-[760px] w-full max-w-[1160px] flex-col overflow-hidden rounded-[30px] border-[6px] border-[#213754] bg-[#f6f0de] shadow-[0_28px_80px_rgba(6,17,31,0.45)]"
    >
      <header class="border-b-[6px] border-[#213754] bg-[#ffd166] px-5 py-4 text-[#14263d] md:px-7">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-[0.68rem] font-bold uppercase tracking-[0.3em] text-[#7a5a18]">
              Meeting Room
            </p>
            <h2 class="mt-1 text-2xl font-bold md:text-3xl">Direct Chat</h2>
            <p class="mt-2 max-w-[64ch] text-sm leading-6 text-[#5d4615] md:text-base">
              Start a one-on-one conversation with another teammate, revisit prior messages,
              and check whether they are online right now.
            </p>
          </div>

          <div class="flex items-center gap-3">
            <p class="text-xs font-bold uppercase tracking-[0.22em] text-[#7a5a18]">
              Socket {{ socketStatus }}
            </p>
            <button
              type="button"
              class="rounded-full border-[3px] border-[#213754] bg-[#fff8e7] px-4 py-2 text-sm font-bold text-[#213754] transition hover:bg-white"
              @click="closeModal"
            >
              Close
            </button>
          </div>
        </div>
      </header>

      <div class="flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,#f6f0de_0%,#eadcb6_100%)] md:flex-row">
        <aside class="flex w-full flex-col border-b-[4px] border-[#213754] bg-[#fff8e7] md:w-[340px] md:border-r-[4px] md:border-b-0">
          <div class="border-b-[3px] border-[#d6c59d] px-5 py-4">
            <p class="text-xs font-bold uppercase tracking-[0.22em] text-[#6b7d91]">
              People
            </p>
            <p class="mt-2 text-sm text-[#29415d]">
              Choose a teammate to open a direct conversation.
            </p>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div
              v-if="loading"
              class="rounded-[22px] border-[3px] border-dashed border-[#b8a77f] bg-[#fff4d5] px-4 py-5 text-sm text-[#6a5430]"
            >
              Loading the office directory...
            </div>

            <div
              v-else-if="directoryEntries.length === 0"
              class="rounded-[22px] border-[3px] border-dashed border-[#b8a77f] bg-[#fff4d5] px-4 py-5 text-sm text-[#6a5430]"
            >
              No other users are available for direct chat yet.
            </div>

            <button
              v-for="entry in directoryEntries"
              :key="entry.user.id"
              type="button"
              class="mb-3 flex w-full items-start gap-3 rounded-[24px] border-[3px] px-4 py-4 text-left transition"
              :class="
                selectedUserId === entry.user.id
                  ? 'border-[#213754] bg-[#e6f3ff]'
                  : 'border-[#d9cfb9] bg-white hover:border-[#7aa5cc]'
              "
              @click="selectUser(entry.user.id)"
            >
              <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#213754] text-sm font-bold text-white">
                {{ displayNameForUser(entry.user).slice(0, 1).toUpperCase() }}
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <p class="truncate text-sm font-bold text-[#1d324d]">
                    {{ displayNameForUser(entry.user) }}
                  </p>
                  <span
                    class="h-2.5 w-2.5 rounded-full"
                    :class="isUserOnline(entry.user.id) ? 'bg-emerald-500' : 'bg-slate-300'"
                  ></span>
                </div>

                <p class="mt-1 text-xs uppercase tracking-[0.18em] text-[#7287a0]">
                  {{ isUserOnline(entry.user.id) ? 'Online' : 'Offline' }}
                </p>

                <p
                  v-if="entry.conversation?.latestMessage"
                  class="mt-2 line-clamp-2 text-sm leading-5 text-[#526981]"
                >
                  {{ entry.conversation.latestMessage.content }}
                </p>
                <p v-else class="mt-2 text-sm leading-5 text-[#7c8ea0]">
                  Start a new conversation.
                </p>
              </div>
            </button>
          </div>
        </aside>

        <div class="flex min-h-0 flex-1 flex-col">
          <div class="border-b-[4px] border-[#213754] bg-[#f9f3e1] px-5 py-4">
            <template v-if="selectedEntry">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-[#7a5a18]">
                    Conversation
                  </p>
                  <h3 class="mt-1 text-xl font-bold text-[#1d324d]">
                    {{ displayNameForUser(selectedEntry.user) }}
                  </h3>
                </div>

                <div class="rounded-full border-[3px] border-[#213754] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#1d324d]">
                  {{ isUserOnline(selectedEntry.user.id) ? 'Online now' : 'Offline' }}
                </div>
              </div>
            </template>
            <template v-else>
              <p class="text-sm text-[#526981]">Choose someone from the left to begin chatting.</p>
            </template>
          </div>

          <div
            v-if="errorMessage"
            class="mx-4 mt-4 rounded-2xl border-[3px] border-[#8b2d1d] bg-[#ffe2dc] px-4 py-3 text-sm font-medium text-[#6c1c11]"
          >
            {{ errorMessage }}
          </div>

          <div
            ref="messageViewport"
            class="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5"
          >
            <div
              v-if="loadingMessages"
              class="rounded-[22px] border-[3px] border-dashed border-[#b8a77f] bg-[#fff4d5] px-4 py-5 text-sm text-[#6a5430]"
            >
              Loading conversation history...
            </div>

            <div
              v-else-if="selectedEntry && !selectedEntry.conversation"
              class="rounded-[22px] border-[3px] border-dashed border-[#b8a77f] bg-[#fff4d5] px-4 py-5 text-sm text-[#6a5430]"
            >
              Start a conversation with {{ displayNameForUser(selectedEntry.user) }}.
            </div>

            <div
              v-else-if="selectedEntry && activeMessages.length === 0"
              class="rounded-[22px] border-[3px] border-dashed border-[#b8a77f] bg-[#fff4d5] px-4 py-5 text-sm text-[#6a5430]"
            >
              No messages yet. Say hello to {{ displayNameForUser(selectedEntry.user) }}.
            </div>

            <div v-else class="space-y-3">
              <article
                v-for="message in activeMessages"
                :key="message.id"
                class="max-w-[82%] rounded-[24px] border-[3px] px-4 py-3"
                :class="
                  message.sender?.id === authStore.user?.id
                    ? 'ml-auto border-[#213754] bg-[#213754] text-white'
                    : 'border-[#c9b98f] bg-white text-[#1d324d]'
                "
              >
                <div class="flex items-center justify-between gap-3">
                  <p
                    class="text-[0.66rem] font-bold uppercase tracking-[0.2em]"
                    :class="
                      message.sender?.id === authStore.user?.id ? 'text-slate-200' : 'text-[#7287a0]'
                    "
                  >
                    {{ displayNameForMessageAuthor(message.sender) }}
                  </p>
                  <p
                    class="text-[0.66rem]"
                    :class="
                      message.sender?.id === authStore.user?.id ? 'text-slate-300' : 'text-[#8aa0b7]'
                    "
                  >
                    {{ formatTimestamp(message.createdAt) }}
                  </p>
                </div>
                <p class="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {{ message.content }}
                </p>
              </article>
            </div>
          </div>

          <form
            class="border-t-[4px] border-[#213754] bg-[#fff8e7] px-4 py-4 md:px-5"
            @submit.prevent="sendMessage"
          >
            <div class="flex flex-col gap-3 md:flex-row">
              <textarea
                v-model="draft"
                :disabled="!selectedEntry || sending"
                class="min-h-[92px] flex-1 rounded-[22px] border-[3px] border-[#213754] bg-white px-4 py-3 text-sm leading-6 text-[#15273f] outline-none disabled:cursor-not-allowed disabled:bg-[#efe5cf]"
                placeholder="Write a direct message..."
                @keydown="handleComposerKeydown"
              />
              <button
                type="submit"
                class="rounded-[22px] border-[4px] border-[#213754] bg-[#8ecae6] px-5 py-3 text-sm font-bold text-[#12324b] transition enabled:hover:bg-[#a9dbf2] disabled:cursor-not-allowed disabled:opacity-60 md:w-[170px]"
                :disabled="!canSendMessage"
              >
                {{ sending ? 'Sending...' : 'Send message' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  </div>
</template>
