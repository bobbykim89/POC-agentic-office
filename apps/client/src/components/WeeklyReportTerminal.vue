<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  WeeklyReportDraftDto,
  WeeklyReportHistoryDto,
  WeeklyReportReviseRequestDto,
  WeeklyReportSaveDraftDto,
  WeeklyReportSaveDraftRequestDto,
  WeeklyReportSendDto,
  WeeklyReportSendRequestDto,
} from '@agentic-office/shared-types';
import { apiRequest } from '../lib/api-client';

interface MicrosoftIntegrationAccount {
  id: string;
  provider: 'microsoft';
  accountEmail: string;
  connectedAt: string;
  scopes: string[];
  tokenExpiresAt: string | null;
}

interface MicrosoftOauthStartResponse {
  authorizationUrl: string;
  state: string;
  expiresAt: string;
}

type TerminalStep = 'compose' | 'review' | 'decision' | 'complete';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const ACCOUNT_STORAGE_KEY = 'agentic-office.weekly-report.account-email';

const step = ref<TerminalStep>('compose');
const accounts = ref<MicrosoftIntegrationAccount[]>([]);
const selectedAccountEmail = ref('');
const history = ref<WeeklyReportHistoryDto | null>(null);
const weeklySummary = ref('');
const revisionInstructions = ref('');
const draft = ref<WeeklyReportDraftDto | null>(null);
const lastWeekPreviewMode = ref<'text' | 'html'>('text');
const draftPreviewMode = ref<'text' | 'html'>('text');
const loadingAccounts = ref(false);
const connectingOutlook = ref(false);
const loadingHistory = ref(false);
const submitting = ref(false);
const busyMessage = ref('');
const errorMessage = ref('');
const successTitle = ref('');
const successMessage = ref('');

const hasAccounts = computed(() => accounts.value.length > 0);
const lastWeekEmail = computed(() => history.value?.last_week_email ?? null);
const canGenerateDraft = computed(
  () =>
    !submitting.value &&
    selectedAccountEmail.value.trim().length > 0 &&
    weeklySummary.value.trim().length > 0,
);
const canReviseDraft = computed(
  () =>
    !submitting.value &&
    draft.value !== null &&
    revisionInstructions.value.trim().length > 0,
);
const canFinalizeDraft = computed(() => !submitting.value && draft.value !== null);
const hasMultipleAccounts = computed(() => accounts.value.length > 1);

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (!isOpen) {
      return;
    }

    await initializeTerminal();
  },
);

watch(selectedAccountEmail, async (nextAccount, previousAccount) => {
  if (!props.isOpen || loadingAccounts.value) {
    return;
  }

  if (!nextAccount) {
    history.value = null;
    return;
  }

  if (nextAccount === previousAccount) {
    return;
  }

  persistSelectedAccount(nextAccount);
  step.value = 'compose';
  draft.value = null;
  revisionInstructions.value = '';
  draftPreviewMode.value = 'text';
  successTitle.value = '';
  successMessage.value = '';
  errorMessage.value = '';
  await loadHistory(nextAccount);
});

async function initializeTerminal() {
  step.value = 'compose';
  draft.value = null;
  history.value = null;
  weeklySummary.value = '';
  revisionInstructions.value = '';
  lastWeekPreviewMode.value = 'text';
  draftPreviewMode.value = 'text';
  errorMessage.value = '';
  successTitle.value = '';
  successMessage.value = '';
  await loadAccounts();
}

async function loadAccounts() {
  loadingAccounts.value = true;
  errorMessage.value = '';

  try {
    const nextAccounts = await apiRequest<MicrosoftIntegrationAccount[]>(
      '/integrations/microsoft/accounts',
    );
    accounts.value = nextAccounts;

    if (nextAccounts.length === 0) {
      selectedAccountEmail.value = '';
      history.value = null;
      return;
    }

    const storedAccount = readStoredAccount();
    const hasStoredAccount = storedAccount
      ? nextAccounts.some((account) => account.accountEmail === storedAccount)
      : false;

    if (hasStoredAccount && storedAccount) {
      selectedAccountEmail.value = storedAccount;
      await loadHistory(storedAccount);
      return;
    }

    if (nextAccounts.length === 1) {
      selectedAccountEmail.value = nextAccounts[0].accountEmail;
      await loadHistory(nextAccounts[0].accountEmail);
      return;
    }

    selectedAccountEmail.value = '';
    history.value = null;
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
    accounts.value = [];
    selectedAccountEmail.value = '';
    history.value = null;
  } finally {
    loadingAccounts.value = false;
  }
}

async function connectOutlook() {
  connectingOutlook.value = true;
  errorMessage.value = '';

  try {
    const redirectTo = buildOAuthReturnUrl();
    const params = new URLSearchParams({
      redirectTo,
    });
    const response = await apiRequest<MicrosoftOauthStartResponse>(
      `/integrations/microsoft/oauth/start?${params.toString()}`,
    );

    if (typeof window !== 'undefined') {
      window.location.assign(response.authorizationUrl);
      return;
    }
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
  } finally {
    connectingOutlook.value = false;
  }
}

async function loadHistory(accountEmail: string) {
  loadingHistory.value = true;
  errorMessage.value = '';

  try {
    const params = new URLSearchParams({
      account_email: accountEmail,
    });
    history.value = await apiRequest<WeeklyReportHistoryDto>(
      `/agents/weekly-report/history?${params.toString()}`,
    );
  } catch (error) {
    history.value = null;
    errorMessage.value = getErrorMessage(error);
  } finally {
    loadingHistory.value = false;
  }
}

async function generateDraft() {
  if (!canGenerateDraft.value) {
    return;
  }

  submitting.value = true;
  busyMessage.value = 'Drafting your 515 from this week’s rough summary and recent examples...';
  errorMessage.value = '';

  try {
    draft.value = await apiRequest<WeeklyReportDraftDto>(
      '/agents/weekly-report/draft',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          account_email: selectedAccountEmail.value.trim(),
          weekly_summary: weeklySummary.value.trim(),
        }),
      },
    );
    revisionInstructions.value = '';
    draftPreviewMode.value = 'text';
    step.value = 'review';
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
  } finally {
    submitting.value = false;
    busyMessage.value = '';
  }
}

async function reviseDraft() {
  if (!draft.value || !canReviseDraft.value) {
    return;
  }

  submitting.value = true;
  busyMessage.value = 'Revising the current 515 draft with your latest instructions...';
  errorMessage.value = '';

  const payload: WeeklyReportReviseRequestDto = {
    account_email: draft.value.account_email,
    current_subject: draft.value.subject,
    current_body: draft.value.body,
    current_body_html: draft.value.body_html,
    revision_instructions: revisionInstructions.value.trim(),
    recipient: draft.value.recipient,
  };

  try {
    const revisedDraft = await apiRequest<WeeklyReportDraftDto>(
      '/agents/weekly-report/revise',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );
    draft.value = {
      ...revisedDraft,
      recipient: revisedDraft.recipient || draft.value.recipient,
    };
    revisionInstructions.value = '';
    draftPreviewMode.value = 'text';
    step.value = 'review';
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
  } finally {
    submitting.value = false;
    busyMessage.value = '';
  }
}

async function saveDraft() {
  if (!draft.value) {
    return;
  }

  submitting.value = true;
  busyMessage.value = 'Saving this 515 to Outlook drafts...';
  errorMessage.value = '';

  const payload: WeeklyReportSaveDraftRequestDto = {
    account_email: draft.value.account_email,
    recipient: draft.value.recipient,
    subject: draft.value.subject,
    body: draft.value.body,
    body_html: draft.value.body_html,
  };

  try {
    const result = await apiRequest<WeeklyReportSaveDraftDto>(
      '/agents/weekly-report/save-draft',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );
    successTitle.value = 'Draft saved';
    successMessage.value = `Saved a draft for ${result.recipient} with subject "${result.subject}".`;
    step.value = 'complete';
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
  } finally {
    submitting.value = false;
    busyMessage.value = '';
  }
}

async function sendDraft() {
  if (!draft.value) {
    return;
  }

  submitting.value = true;
  busyMessage.value = 'Sending your 515 through Outlook...';
  errorMessage.value = '';

  const payload: WeeklyReportSendRequestDto = {
    account_email: draft.value.account_email,
    recipient: draft.value.recipient,
    subject: draft.value.subject,
    body: draft.value.body,
    body_html: draft.value.body_html,
    confirm_send: true,
  };

  try {
    const result = await apiRequest<WeeklyReportSendDto>(
      '/agents/weekly-report/send',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );
    successTitle.value = '515 sent';
    successMessage.value = `Sent the weekly report to ${result.recipient}.`;
    step.value = 'complete';
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
  } finally {
    submitting.value = false;
    busyMessage.value = '';
  }
}

function closeTerminal() {
  emit('close');
}

function readStoredAccount() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
}

function persistSelectedAccount(accountEmail: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ACCOUNT_STORAGE_KEY, accountEmail);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function buildOAuthReturnUrl() {
  if (typeof window === 'undefined') {
    return 'http://localhost:5000/?open=weekly-report';
  }

  const url = new URL(window.location.origin);
  url.searchParams.set('open', 'weekly-report');
  return url.toString();
}

function formatSentDate(sentAt: string | null) {
  if (!sentAt) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(sentAt));
}

function buildEmailPreviewDocument(bodyHtml: string | null, bodyText: string) {
  const content = bodyHtml?.trim()
    ? bodyHtml
    : `<pre>${escapeHtml(bodyText)}</pre>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #fffdf6;
        color: #1d324d;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        line-height: 1.55;
      }
      body {
        padding: 16px;
        word-break: break-word;
      }
      pre {
        white-space: pre-wrap;
        font-family: inherit;
        margin: 0;
      }
      img {
        max-width: 100%;
        height: auto;
      }
    </style>
  </head>
  <body>
    ${content}
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
</script>

<template>
  <div
    v-if="isOpen"
    class="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(7,16,28,0.78)] p-3 md:p-6"
  >
    <section
      class="relative flex h-full max-h-[760px] w-full max-w-[1040px] flex-col overflow-hidden rounded-[30px] border-[6px] border-[#213754] bg-[#f6f0de] shadow-[0_28px_80px_rgba(6,17,31,0.45)]"
    >
      <header class="border-b-[6px] border-[#213754] bg-[#a2d2ff] px-5 py-4 text-[#14263d] md:px-7">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-[0.68rem] font-bold uppercase tracking-[0.3em] text-[#35516f]">
              Main Computer
            </p>
            <h2 class="mt-1 text-2xl font-bold md:text-3xl">515 Generator Terminal</h2>
            <p class="mt-2 max-w-[62ch] text-sm leading-6 text-[#294361] md:text-base">
              Review last week&apos;s 515, write a rough summary for this week, then revise until
              the draft is ready to send or save.
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
        <div
          v-if="submitting"
          class="mb-4 flex items-center gap-3 rounded-2xl border-[3px] border-[#213754] bg-[#d9f0ff] px-4 py-3 text-[#17314b]"
        >
          <span
            class="inline-block h-4 w-4 animate-spin rounded-full border-[3px] border-[#4d7298] border-t-[#17314b]"
          ></span>
          <div>
            <p class="text-xs font-bold uppercase tracking-[0.24em] text-[#4d7298]">Working</p>
            <p class="text-sm font-medium">
              {{ busyMessage || 'The 515 generator is still working on your request.' }}
            </p>
          </div>
        </div>

        <p
          v-if="errorMessage"
          class="mb-4 rounded-2xl border-[3px] border-[#8b2d1d] bg-[#ffe2dc] px-4 py-3 text-sm font-medium text-[#6c1c11]"
        >
          {{ errorMessage }}
        </p>

        <template v-if="step === 'compose'">
          <div class="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <article class="rounded-[26px] border-[4px] border-[#213754] bg-[#fff8e7] p-4 text-[#1d324d]">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#5d7793]">
                    Connected Account
                  </p>
                  <p class="mt-1 text-sm leading-6">
                    Pick the Outlook account whose recent 515 history should guide this draft.
                  </p>
                </div>
                <span
                  v-if="loadingAccounts"
                  class="rounded-full bg-[#dbeafe] px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#35516f]"
                >
                  Loading
                </span>
              </div>

              <div class="mt-4">
                <template v-if="!hasAccounts && !loadingAccounts">
                  <p class="rounded-2xl border-[3px] border-dashed border-[#6d88a3] px-4 py-3 text-sm leading-6 text-[#35516f]">
                    No connected Outlook accounts were found for the weekly report agent yet.
                  </p>
                  <button
                    type="button"
                    class="mt-3 rounded-full border-[4px] border-[#213754] bg-[#8ecae6] px-5 py-3 text-sm font-bold text-[#12324b] transition enabled:hover:bg-[#a9dbf2] disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="connectingOutlook"
                    @click="connectOutlook"
                  >
                    {{ connectingOutlook ? 'Connecting...' : 'Connect Outlook' }}
                  </button>
                </template>

                <template v-else>
                  <label class="text-xs font-bold uppercase tracking-[0.24em] text-[#5d7793]">
                    Account
                  </label>
                  <select
                    v-model="selectedAccountEmail"
                    class="mt-2 w-full rounded-2xl border-[3px] border-[#213754] bg-white px-4 py-3 text-sm font-medium text-[#15273f] outline-none"
                  >
                    <option value="" :disabled="hasMultipleAccounts">Select an account</option>
                    <option
                      v-for="account in accounts"
                      :key="account.id"
                      :value="account.accountEmail"
                    >
                      {{ account.accountEmail }}
                    </option>
                  </select>

                  <button
                    type="button"
                    class="mt-3 rounded-full border-[3px] border-[#213754] bg-white px-4 py-2 text-sm font-bold text-[#213754] transition enabled:hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="connectingOutlook"
                    @click="connectOutlook"
                  >
                    {{ connectingOutlook ? 'Connecting...' : 'Connect another Outlook account' }}
                  </button>
                </template>
              </div>

              <div class="mt-5">
                <p class="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#5d7793]">
                  Last Week&apos;s 515
                </p>

                <div
                  class="mt-2 rounded-[22px] border-[3px] border-[#c6b483] bg-[#fffdf6] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                >
                  <template v-if="loadingHistory">
                    <p class="text-sm font-medium text-[#35516f]">
                      Loading the latest sent 515 for this account...
                    </p>
                  </template>

                  <template v-else-if="lastWeekEmail">
                    <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#5d7793]">
                      Sent {{ formatSentDate(lastWeekEmail.sent_at) }}
                    </p>
                    <p class="mt-3 text-sm font-semibold text-[#1d324d]">
                      {{ lastWeekEmail.subject }}
                    </p>
                    <div class="mt-3 flex gap-2">
                      <button
                        type="button"
                        class="rounded-full border-[2px] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]"
                        :class="
                          lastWeekPreviewMode === 'text'
                            ? 'border-[#213754] bg-[#213754] text-white'
                            : 'border-[#8aa0b8] bg-white text-[#35516f]'
                        "
                        @click="lastWeekPreviewMode = 'text'"
                      >
                        Plain text
                      </button>
                      <button
                        type="button"
                        class="rounded-full border-[2px] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]"
                        :class="
                          lastWeekPreviewMode === 'html'
                            ? 'border-[#213754] bg-[#213754] text-white'
                            : 'border-[#8aa0b8] bg-white text-[#35516f]'
                        "
                        @click="lastWeekPreviewMode = 'html'"
                      >
                        Email preview
                      </button>
                    </div>

                    <pre
                      v-if="lastWeekPreviewMode === 'text'"
                      class="mt-3 overflow-x-auto whitespace-pre-wrap text-sm leading-6 text-[#1d324d]"
                    >{{ lastWeekEmail.body_text }}</pre>
                    <iframe
                      v-else
                      class="mt-3 h-[300px] w-full rounded-[18px] border-[2px] border-[#d7c69a] bg-white"
                      :srcdoc="buildEmailPreviewDocument(lastWeekEmail.body_html, lastWeekEmail.body_text)"
                      sandbox=""
                      title="Last week's 515 email preview"
                    ></iframe>
                  </template>

                  <template v-else>
                    <p class="text-sm leading-6 text-[#35516f]">
                      Once an account is selected, the most relevant recent 515 will appear here.
                    </p>
                  </template>
                </div>
              </div>
            </article>

            <article class="rounded-[26px] border-[4px] border-[#213754] bg-[#fff8e7] p-4 text-[#1d324d]">
              <p class="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#5d7793]">
                This Week&apos;s Rough Summary
              </p>
              <p class="mt-2 text-sm leading-6">
                Write your raw notes here. The agent will turn them into a polished 515 draft.
              </p>

              <textarea
                v-model="weeklySummary"
                class="mt-4 min-h-[340px] w-full rounded-[22px] border-[3px] border-[#213754] bg-white px-4 py-4 text-sm leading-6 text-[#15273f] outline-none"
                placeholder="This week I..."
              />

              <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#5d7793]">
                  {{ weeklySummary.length }} characters
                </p>

                <button
                  type="button"
                  class="rounded-full border-[4px] border-[#213754] bg-[#ffd166] px-5 py-3 text-sm font-bold text-[#1f2d3a] transition enabled:hover:bg-[#ffdd86] disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="!canGenerateDraft"
                  @click="generateDraft"
                >
                  {{ submitting ? 'Drafting...' : 'Generate 515 Draft' }}
                </button>
              </div>
            </article>
          </div>
        </template>

        <template v-else-if="step === 'review' && draft">
          <div class="grid gap-4 lg:grid-cols-[minmax(0,1.16fr)_minmax(320px,0.84fr)]">
            <article class="rounded-[26px] border-[4px] border-[#213754] bg-[#fff8e7] p-4 text-[#1d324d]">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#5d7793]">
                    Prospective 515
                  </p>
                  <p class="mt-2 text-sm leading-6">
                    Review the draft below. If it needs changes, give the agent another round of
                    instructions.
                  </p>
                </div>
                <button
                  type="button"
                  class="rounded-full border-[3px] border-[#213754] bg-white px-4 py-2 text-sm font-bold text-[#213754] transition hover:bg-[#f8fbff]"
                  @click="step = 'compose'"
                >
                  Back to summary
                </button>
              </div>

              <div class="mt-4 rounded-[22px] border-[3px] border-[#c6b483] bg-[#fffdf6] p-4">
                <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#5d7793]">
                  To {{ draft.recipient || 'Recipient not found' }}
                </p>
                <p class="mt-3 text-sm font-semibold text-[#1d324d]">{{ draft.subject }}</p>
                <div class="mt-3 flex gap-2">
                  <button
                    type="button"
                    class="rounded-full border-[2px] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]"
                    :class="
                      draftPreviewMode === 'text'
                        ? 'border-[#213754] bg-[#213754] text-white'
                        : 'border-[#8aa0b8] bg-white text-[#35516f]'
                    "
                    @click="draftPreviewMode = 'text'"
                  >
                    Plain text
                  </button>
                  <button
                    type="button"
                    class="rounded-full border-[2px] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]"
                    :class="
                      draftPreviewMode === 'html'
                        ? 'border-[#213754] bg-[#213754] text-white'
                        : 'border-[#8aa0b8] bg-white text-[#35516f]'
                    "
                    @click="draftPreviewMode = 'html'"
                  >
                    Email preview
                  </button>
                </div>

                <pre
                  v-if="draftPreviewMode === 'text'"
                  class="mt-4 overflow-x-auto whitespace-pre-wrap text-sm leading-6 text-[#1d324d]"
                >{{ draft.body }}</pre>
                <iframe
                  v-else
                  class="mt-4 h-[320px] w-full rounded-[18px] border-[2px] border-[#d7c69a] bg-white"
                  :srcdoc="buildEmailPreviewDocument(draft.body_html, draft.body)"
                  sandbox=""
                  title="Draft 515 email preview"
                ></iframe>
              </div>
            </article>

            <article class="rounded-[26px] border-[4px] border-[#213754] bg-[#fff8e7] p-4 text-[#1d324d]">
              <p class="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#5d7793]">
                Revision Instructions
              </p>
              <p class="mt-2 text-sm leading-6">
                Ask for any changes you want, like adding missing details, tightening the tone, or
                keeping it closer to last week&apos;s style.
              </p>

              <textarea
                v-model="revisionInstructions"
                class="mt-4 min-h-[220px] w-full rounded-[22px] border-[3px] border-[#213754] bg-white px-4 py-4 text-sm leading-6 text-[#15273f] outline-none"
                placeholder="Mention the design sync, make the priorities shorter, and sound a little more direct."
              />

              <div class="mt-4 grid gap-3">
                <button
                  type="button"
                  class="rounded-full border-[4px] border-[#213754] bg-[#8ecae6] px-5 py-3 text-sm font-bold text-[#12324b] transition enabled:hover:bg-[#a9dbf2] disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="!canReviseDraft"
                  @click="reviseDraft"
                >
                  {{ submitting ? 'Revising...' : 'Revise Draft' }}
                </button>

                <button
                  type="button"
                  class="rounded-full border-[4px] border-[#213754] bg-[#ffd166] px-5 py-3 text-sm font-bold text-[#1f2d3a] transition enabled:hover:bg-[#ffdd86] disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="!canFinalizeDraft"
                  @click="step = 'decision'"
                >
                  Looks good
                </button>
              </div>
            </article>
          </div>
        </template>

        <template v-else-if="step === 'decision' && draft">
          <div class="mx-auto max-w-[820px] rounded-[28px] border-[4px] border-[#213754] bg-[#fff8e7] p-5 text-[#1d324d]">
            <p class="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#5d7793]">
              Final Decision
            </p>
            <h3 class="mt-2 text-2xl font-bold">Ready to save or send?</h3>
            <p class="mt-3 text-sm leading-6">
              This draft is ready for the next step. You can send it now, save it as an Outlook
              draft, or hop back into editing.
            </p>

            <div class="mt-5 rounded-[22px] border-[3px] border-[#c6b483] bg-[#fffdf6] p-4">
              <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#5d7793]">
                To {{ draft.recipient || 'Recipient not found' }}
              </p>
              <p class="mt-3 text-sm font-semibold text-[#1d324d]">{{ draft.subject }}</p>
              <div class="mt-3 flex gap-2">
                <button
                  type="button"
                  class="rounded-full border-[2px] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]"
                  :class="
                    draftPreviewMode === 'text'
                      ? 'border-[#213754] bg-[#213754] text-white'
                      : 'border-[#8aa0b8] bg-white text-[#35516f]'
                  "
                  @click="draftPreviewMode = 'text'"
                >
                  Plain text
                </button>
                <button
                  type="button"
                  class="rounded-full border-[2px] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]"
                  :class="
                    draftPreviewMode === 'html'
                      ? 'border-[#213754] bg-[#213754] text-white'
                      : 'border-[#8aa0b8] bg-white text-[#35516f]'
                  "
                  @click="draftPreviewMode = 'html'"
                >
                  Email preview
                </button>
              </div>

              <pre
                v-if="draftPreviewMode === 'text'"
                class="mt-4 max-h-[280px] overflow-auto whitespace-pre-wrap text-sm leading-6 text-[#1d324d]"
              >{{ draft.body }}</pre>
              <iframe
                v-else
                class="mt-4 h-[320px] w-full rounded-[18px] border-[2px] border-[#d7c69a] bg-white"
                :srcdoc="buildEmailPreviewDocument(draft.body_html, draft.body)"
                sandbox=""
                title="Final draft 515 email preview"
              ></iframe>
            </div>

            <div class="mt-5 grid gap-3 md:grid-cols-3">
              <button
                type="button"
                class="rounded-full border-[4px] border-[#213754] bg-[#9be28f] px-5 py-3 text-sm font-bold text-[#12311a] transition enabled:hover:bg-[#b4ecaa] disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="submitting"
                @click="sendDraft"
              >
                {{ submitting ? 'Sending...' : 'Send now' }}
              </button>

              <button
                type="button"
                class="rounded-full border-[4px] border-[#213754] bg-[#ffd166] px-5 py-3 text-sm font-bold text-[#1f2d3a] transition enabled:hover:bg-[#ffdd86] disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="submitting"
                @click="saveDraft"
              >
                {{ submitting ? 'Saving...' : 'Save as draft' }}
              </button>

              <button
                type="button"
                class="rounded-full border-[4px] border-[#213754] bg-white px-5 py-3 text-sm font-bold text-[#213754] transition hover:bg-[#f8fbff]"
                :disabled="submitting"
                @click="step = 'review'"
              >
                Keep editing
              </button>
            </div>
          </div>
        </template>

        <template v-else-if="step === 'complete'">
          <div class="mx-auto max-w-[720px] rounded-[28px] border-[4px] border-[#213754] bg-[#fff8e7] p-5 text-center text-[#1d324d]">
            <p class="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#5d7793]">
              Workflow Complete
            </p>
            <h3 class="mt-2 text-2xl font-bold">{{ successTitle }}</h3>
            <p class="mt-4 text-sm leading-7">{{ successMessage }}</p>

            <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                class="rounded-full border-[4px] border-[#213754] bg-[#8ecae6] px-5 py-3 text-sm font-bold text-[#12324b] transition hover:bg-[#a9dbf2]"
                @click="step = 'compose'"
              >
                Start another 515
              </button>

              <button
                type="button"
                class="rounded-full border-[4px] border-[#213754] bg-white px-5 py-3 text-sm font-bold text-[#213754] transition hover:bg-[#f8fbff]"
                @click="closeTerminal"
              >
                Close terminal
              </button>
            </div>
          </div>
        </template>
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
            {{ busyMessage || 'The 515 generator is still working on your request.' }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
