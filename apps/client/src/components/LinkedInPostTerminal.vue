<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { LinkedInPostDto } from '@agentic-office/shared-types';
import { apiRequest } from '../lib/api-client';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
  complete: [payload: LinkedInPostDto];
}>();

const MAX_INPUT_LENGTH = 200;

const inputText = ref('');
const submitting = ref(false);
const errorMessage = ref('');

const canGenerate = computed(
  () =>
    !submitting.value &&
    inputText.value.trim().length > 0 &&
    inputText.value.length <= MAX_INPUT_LENGTH,
);

watch(
  () => props.isOpen,
  (isOpen) => {
    if (!isOpen) {
      return;
    }

    inputText.value = '';
    errorMessage.value = '';
    submitting.value = false;
  },
);

async function generatePost() {
  if (!canGenerate.value) {
    return;
  }

  submitting.value = true;
  errorMessage.value = '';

  try {
    const nextResult = await apiRequest<LinkedInPostDto>(
      '/agents/linkedin-post',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: inputText.value.trim(),
        }),
      },
    );
    emit('complete', nextResult);
    emit('close');
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
  } finally {
    submitting.value = false;
  }
}

function closeTerminal() {
  emit('close');
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}
</script>

<template>
  <div
    v-if="isOpen"
    class="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(7,16,28,0.78)] p-3 md:p-6"
  >
    <section
      class="relative flex w-full max-w-[640px] flex-col overflow-hidden rounded-[30px] border-[6px] border-[#213754] bg-[#f6f0de] shadow-[0_28px_80px_rgba(6,17,31,0.45)]"
    >
      <header class="border-b-[6px] border-[#213754] bg-[#ffd166] px-5 py-4 text-[#14263d] md:px-7">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-[0.68rem] font-bold uppercase tracking-[0.3em] text-[#7a5a18]">
              Main Computer
            </p>
            <h2 class="mt-1 text-2xl font-bold md:text-3xl">LinkedIn Post Generator</h2>
            <p class="mt-2 max-w-[58ch] text-sm leading-6 text-[#5d4615] md:text-base">
              Drop in a short idea and this workstation turns it into a polished, mildly
              overconfident LinkedIn post.
            </p>
          </div>

          <button
            type="button"
            class="rounded-full border-[3px] border-[#213754] bg-[#fff8e7] px-4 py-2 text-sm font-bold text-[#213754] transition hover:bg-white"
            @click="closeTerminal"
          >
            Close
          </button>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f6f0de_0%,#eadcb6_100%)] px-4 py-4 md:px-6 md:py-5">
        <p
          v-if="errorMessage"
          class="mb-4 rounded-2xl border-[3px] border-[#8b2d1d] bg-[#ffe2dc] px-4 py-3 text-sm font-medium text-[#6c1c11]"
        >
          {{ errorMessage }}
        </p>

        <article class="mx-auto w-full rounded-[26px] border-[4px] border-[#213754] bg-[#fff8e7] p-4 text-[#1d324d]">
          <textarea
            v-model="inputText"
            :maxlength="MAX_INPUT_LENGTH"
            class="min-h-[170px] w-full rounded-[22px] border-[3px] border-[#213754] bg-white px-4 py-4 text-sm leading-6 text-[#15273f] outline-none"
            placeholder="I finally fixed that bug right before my coffee got cold."
          />

          <div class="mt-4 flex flex-wrap items-center justify-end gap-3">
            <p class="text-right text-xs font-bold uppercase tracking-[0.2em] text-[#5d7793]">
              {{ inputText.length }}/200 characters
            </p>
          </div>

          <button
            type="button"
            class="mt-4 rounded-full border-[4px] border-[#213754] bg-[#8ecae6] px-5 py-3 text-sm font-bold text-[#12324b] transition enabled:hover:bg-[#a9dbf2] disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!canGenerate"
            @click="generatePost"
          >
            {{ submitting ? 'Generating...' : 'Generate LinkedIn Post' }}
          </button>
        </article>
      </div>

      <div
        v-if="submitting"
        class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[rgba(246,240,222,0.38)]"
      >
        <div
          class="rounded-[24px] border-[4px] border-[#213754] bg-[#fff8e7] px-5 py-4 text-center text-[#1d324d] shadow-[0_20px_50px_rgba(6,17,31,0.22)]"
        >
          <div class="mx-auto h-8 w-8 animate-spin rounded-full border-[4px] border-[#8ecae6] border-t-[#213754]"></div>
          <p class="mt-3 text-xs font-bold uppercase tracking-[0.24em] text-[#5d7793]">Please wait</p>
          <p class="mt-2 text-sm font-medium">
            Generating your LinkedIn post...
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
