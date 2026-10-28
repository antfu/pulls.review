<script setup lang="ts">
import type { GithubOauthSession } from '../../auth/github-oauth'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayAvatar from '@antfu/design/components/Display/DisplayAvatar.vue'
import FormField from '@antfu/design/components/Form/FormField.vue'

defineProps<{
  account: GithubOauthSession | null
  busy?: boolean
  oauthAvailable: boolean
}>()

const emit = defineEmits<{
  signIn: []
  signOut: []
}>()
</script>

<template>
  <FormField>
    <template #label>
      <div class="flex items-center gap-1 pb1">
        <div class="i-carbon-logo-github text-lg" />
        {{ $t('settings.token.label') }}
      </div>
    </template>

    <div v-if="account" class="flex items-start gap-3 border border-base rounded bg-raised p-3">
      <DisplayAvatar :src="account.avatarUrl" :name="account.login" :size="36" />
      <div class="min-w-0 flex flex-1 flex-col gap-1">
        <div class="flex items-baseline gap-2">
          <span class="truncate text-sm color-base font-medium">{{ account.login }}</span>
          <span v-if="account.name" class="truncate text-xs color-faint">{{ account.name }}</span>
        </div>
        <span class="text-xs color-faint">{{ $t('settings.token.viaApp') }}</span>
      </div>
      <ActionIconButton
        icon="i-ph:sign-out-duotone"
        :label="$t('settings.token.signOut')"
        :tooltip="$t('settings.token.signOut')"
        class="text-sm"
        @click="emit('signOut')"
      />
    </div>

    <div v-else-if="oauthAvailable" class="flex flex-col gap-3">
      <ActionButton
        icon="i-ph:github-logo-duotone"
        :loading="busy"
        @click="emit('signIn')"
      >
        {{ $t('settings.token.signIn') }}
      </ActionButton>
      <p class="text-xs color-faint">
        {{ busy ? $t('settings.token.checking') : $t('settings.token.signInHint') }}
      </p>
    </div>

    <p v-else class="text-sm color-faint">
      {{ $t('settings.token.embedAnonymous') }}
    </p>
  </FormField>
</template>
