<script setup lang="ts">
import type { DevframeRpcClient } from 'devframe/client'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { onMounted, ref } from 'vue'

const props = defineProps<{
  client: DevframeRpcClient
  onTrusted: () => void
}>()

const code = ref('')
const failed = ref(false)
const busy = ref(false)

// Prints a fresh code in the terminal the server runs in.
onMounted(() => props.client.requestAuthCode())

async function submit() {
  busy.value = true
  failed.value = false
  try {
    if (await props.client.requestTrustWithCode(code.value.trim()))
      props.onTrusted()
    else
      failed.value = true
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-6">
    <form class="max-w-90 w-full flex flex-col gap-3" @submit.prevent="submit">
      <h1 class="text-lg font-semibold">
        {{ $t('local.auth.title') }}
      </h1>
      <p class="text-sm op-fade">
        {{ $t('local.auth.hint') }}
      </p>
      <input
        v-model="code"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        class="border border-base rounded bg-base px-3 py-2 text-center text-xl tracking-widest font-mono"
        :aria-label="$t('local.auth.title')"
      >
      <p v-if="failed" class="text-sm text-red-500">
        {{ $t('local.auth.invalid') }}
      </p>
      <ActionButton variant="primary" type="submit" :disabled="busy || code.trim().length !== 6">
        {{ $t('local.auth.submit') }}
      </ActionButton>
    </form>
  </main>
</template>
