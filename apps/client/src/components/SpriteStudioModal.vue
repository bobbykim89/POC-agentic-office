<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { apiRequest } from '../lib/api-client'
import { useAuthStore, type AuthUser } from '../stores/auth'

interface SpritePayload {
  spriteSheetUrl: string
  user: AuthUser
  sprite: Record<string, unknown>
}

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
  complete: [payload: SpritePayload]
}>()

const authStore = useAuthStore()
const mode = ref<'description' | 'image'>('description')
const description = ref('')
const selectedImageFile = ref<File | null>(null)
const selectedFileName = ref('')
const submitting = ref(false)
const errorMessage = ref('')

const canSubmit = computed(() => {
  if (submitting.value) {
    return false
  }

  if (mode.value === 'description') {
    return description.value.trim().length > 0 && !selectedImageFile.value
  }

  return Boolean(selectedImageFile.value) && !description.value.trim()
})

watch(
  () => props.isOpen,
  (isOpen) => {
    if (!isOpen) {
      return
    }

    resetState()
  },
)

watch(mode, (nextMode) => {
  errorMessage.value = ''

  if (nextMode === 'description') {
    clearSelectedImage()
    return
  }

  description.value = ''
})

async function submit() {
  if (!canSubmit.value) {
    return
  }

  submitting.value = true
  errorMessage.value = ''

  try {
    const payload = new FormData()
    if (mode.value === 'description') {
      payload.set('description', description.value.trim())
    } else if (selectedImageFile.value) {
      payload.set('image', selectedImageFile.value, selectedImageFile.value.name)
    }

    const response = await apiRequest<SpritePayload>('/agents/sprite-sheet', {
      method: 'POST',
      body: payload,
    })

    authStore.setCurrentUser(response.user)
    emit('complete', response)
    emit('close')
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Sprite generation failed.'
  } finally {
    submitting.value = false
  }
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]

  if (!file) {
    clearSelectedImage()
    return
  }

  if (!file.type.startsWith('image/')) {
    clearSelectedImage()
    errorMessage.value = 'Please choose an image file.'
    return
  }

  selectedFileName.value = file.name
  selectedImageFile.value = file
  description.value = ''
  errorMessage.value = ''
}

function closeModal() {
  emit('close')
}

function clearSelectedImage() {
  selectedImageFile.value = null
  selectedFileName.value = ''
}

function resetState() {
  mode.value = 'description'
  description.value = ''
  clearSelectedImage()
  submitting.value = false
  errorMessage.value = ''
}

</script>

<template>
  <div
    v-if="isOpen"
    class="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(7,16,28,0.78)] p-3 md:p-6"
  >
    <section
      class="relative flex w-full max-w-[720px] flex-col overflow-hidden rounded-[30px] border-[6px] border-[#213754] bg-[#f6f0de] shadow-[0_28px_80px_rgba(6,17,31,0.45)]"
    >
      <header class="border-b-[6px] border-[#213754] bg-[#8ecae6] px-5 py-4 text-[#14263d] md:px-7">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-[0.68rem] font-bold uppercase tracking-[0.3em] text-[#24546e]">
              Video Room
            </p>
            <h2 class="mt-1 text-2xl font-bold md:text-3xl">Sprite Studio</h2>
            <p class="mt-2 max-w-[60ch] text-sm leading-6 text-[#214863] md:text-base">
              Generate a custom office sprite from a short self-description or a photo.
            </p>
          </div>

          <button
            type="button"
            class="rounded-full border-[3px] border-[#213754] bg-[#fff8e7] px-4 py-2 text-sm font-bold text-[#213754] transition hover:bg-white"
            @click="closeModal"
          >
            Close
          </button>
        </div>
      </header>

      <div class="bg-[linear-gradient(180deg,#f6f0de_0%,#eadcb6_100%)] px-4 py-4 md:px-6 md:py-5">
        <p
          v-if="errorMessage"
          class="mb-4 rounded-2xl border-[3px] border-[#8b2d1d] bg-[#ffe2dc] px-4 py-3 text-sm font-medium text-[#6c1c11]"
        >
          {{ errorMessage }}
        </p>

        <article class="rounded-[26px] border-[4px] border-[#213754] bg-[#fff8e7] p-4 text-[#1d324d]">
          <div class="flex flex-wrap gap-3">
            <button
              type="button"
              class="rounded-full border-[3px] px-4 py-2 text-sm font-bold transition"
              :class="
                mode === 'description'
                  ? 'border-[#213754] bg-[#213754] text-white'
                  : 'border-[#8aa0b8] bg-white text-[#35516f]'
              "
              @click="mode = 'description'"
            >
              Describe yourself
            </button>
            <button
              type="button"
              class="rounded-full border-[3px] px-4 py-2 text-sm font-bold transition"
              :class="
                mode === 'image'
                  ? 'border-[#213754] bg-[#213754] text-white'
                  : 'border-[#8aa0b8] bg-white text-[#35516f]'
              "
              @click="mode = 'image'"
            >
              Upload a photo
            </button>
          </div>

          <div v-if="mode === 'description'" class="mt-4">
            <p class="text-sm leading-6 text-[#35516f]">
              Describe your look, clothing, and overall vibe. Keep it short and visual.
            </p>
            <textarea
              v-model="description"
              class="mt-3 min-h-[220px] w-full rounded-[22px] border-[3px] border-[#213754] bg-white px-4 py-4 text-sm leading-6 text-[#15273f] outline-none"
              placeholder="I have shoulder-length dark hair, glasses, a green sweater, black pants, and white sneakers."
            />
          </div>

          <div v-else class="mt-4">
            <p class="text-sm leading-6 text-[#35516f]">
              Upload a clear image. The sprite generator will turn it into the office character sheet.
            </p>

            <label
              class="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-[24px] border-[3px] border-dashed border-[#6d88a3] bg-white px-6 py-10 text-center"
            >
              <span class="text-sm font-bold text-[#1d324d]">
                {{ selectedFileName || 'Choose an image file' }}
              </span>
              <span class="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-[#5d7793]">
                PNG, JPG, WEBP
              </span>
              <input
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleFileChange"
              />
            </label>
          </div>

          <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p class="max-w-[42ch] text-xs font-bold uppercase tracking-[0.18em] text-[#5d7793]">
              Use one input mode only. The generated sprite will replace your default office avatar.
            </p>

            <button
              type="button"
              class="rounded-full border-[4px] border-[#213754] bg-[#ffd166] px-5 py-3 text-sm font-bold text-[#1f2d3a] transition enabled:hover:bg-[#ffdd86] disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="!canSubmit"
              @click="submit"
            >
              {{ submitting ? 'Generating...' : 'Generate Sprite' }}
            </button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
