<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const username = ref('')
const email = ref('')
const password = ref('')
const errorMessage = ref('')

const canSubmit = computed(
  () =>
    !authStore.isLoading &&
    username.value.trim().length > 0 &&
    email.value.trim().length > 0 &&
    password.value.length >= 8,
)

async function submit() {
  if (!canSubmit.value) {
    return
  }

  errorMessage.value = ''

  try {
    await authStore.signup({
      username: username.value.trim(),
      email: email.value.trim(),
      password: password.value,
    })
    await router.replace('/')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Signup failed.'
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#21354a,#111927)] px-4 py-8">
    <section class="w-full max-w-md rounded-[28px] bg-white/90 p-6 shadow-[0_24px_60px_rgba(31,42,55,0.22)] backdrop-blur">
      <p class="text-xs font-bold uppercase tracking-[0.24em] text-slate-600">Agentic Office</p>
      <h1 class="mt-3 text-3xl font-semibold text-slate-900">Sign up</h1>
      <p class="mt-2 text-sm leading-6 text-slate-600">
        Create an account and enter the office dashboard.
      </p>

      <p
        v-if="errorMessage"
        class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
      >
        {{ errorMessage }}
      </p>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <label class="block">
          <span class="mb-2 block text-sm font-medium text-slate-700">Username</span>
          <input
            v-model="username"
            type="text"
            class="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-sky-500"
          />
        </label>

        <label class="block">
          <span class="mb-2 block text-sm font-medium text-slate-700">Email</span>
          <input
            v-model="email"
            type="email"
            class="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-sky-500"
          />
        </label>

        <label class="block">
          <span class="mb-2 block text-sm font-medium text-slate-700">Password</span>
          <input
            v-model="password"
            type="password"
            class="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-sky-500"
          />
          <span class="mt-2 block text-xs text-slate-500">Minimum 8 characters.</span>
        </label>

        <button
          type="submit"
          class="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          :disabled="!canSubmit"
        >
          {{ authStore.isLoading ? 'Creating account...' : 'Sign up' }}
        </button>
      </form>

      <p class="mt-5 text-sm text-slate-600">
        Already have an account?
        <RouterLink class="font-semibold text-sky-700" to="/login">Login</RouterLink>
      </p>
    </section>
  </main>
</template>
