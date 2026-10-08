<script setup lang="ts">
import type { StoredTokenMeta } from '../../composables/useTokenMeta'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayAvatar from '@antfu/design/components/Display/DisplayAvatar.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayDate from '@antfu/design/components/Display/DisplayDate.vue'
import FormField from '@antfu/design/components/Form/FormField.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import { ref, watch } from 'vue'

// One host's token: the entry form with its description slot, or the saved token's card.
const props = defineProps<{
  /** The host's logo, as an icon class. */
  icon: string
  label: string
  placeholder: string
  /** Shown on the card in place of scopes when the token lists none. */
  noScopes: string
  /** A token is saved in settings (the meta may still be resolving). */
  tokenSet: boolean
  meta: StoredTokenMeta | null
  /** A validation/resolve fetch is in flight. */
  busy?: boolean
  error?: string
}>()

const emit = defineEmits<{
  /** Save a new token (validated by the parent before persisting); `''` removes it. */
  save: [token: string]
}>()

const editing = ref(false)
const draft = ref('')

// The parent validates asynchronously: a save attempt ends when `busy` falls.
// No error means it was persisted - leave edit mode.
watch(() => props.busy, (busy, wasBusy) => {
  if (wasBusy && !busy && !props.error) {
    editing.value = false
    draft.value = ''
  }
})

function cancel() {
  editing.value = false
  draft.value = ''
}

// Removing a token can't fail (nothing to validate), so exit edit mode eagerly.
function remove() {
  emit('save', '')
  cancel()
}
</script>

<template>
  <FormField
    v-if="!tokenSet || editing"
    :error="error"
  >
    <template #label>
      <div class="flex items-center gap-1 pb1">
        <div :class="icon" class="text-lg" />
        {{ label }}
      </div>
    </template>
    <div class="flex items-center gap-2">
      <FormTextInput
        v-model="draft"
        type="password"
        icon="i-ph-key-duotone"
        :placeholder="placeholder"
        class="flex-1"
        :disabled="busy"
        :invalid="!!error"
        @keyup.enter="draft && emit('save', draft)"
      />
      <ActionButton :loading="busy" :disabled="!draft" @click="emit('save', draft)">
        {{ $t('common.save') }}
      </ActionButton>
      <ActionButton v-if="editing" variant="text" :disabled="busy" @click="cancel">
        {{ $t('common.cancel') }}
      </ActionButton>
      <ActionButton v-if="editing" variant="text" :disabled="busy" @click="remove">
        {{ $t('common.remove') }}
      </ActionButton>
    </div>
    <template #description>
      <slot name="description" />
    </template>
  </FormField>

  <FormField v-else>
    <template #label>
      <div class="flex items-center gap-1">
        <div :class="icon" class="text-lg" />
        {{ label }}
      </div>
    </template>
    <div class="flex flex-col gap-2 border border-base rounded bg-raised p-3">
      <div v-if="meta" class="flex items-start gap-3">
        <DisplayAvatar :src="meta.avatarUrl" :name="meta.login" :size="36" />
        <div class="min-w-0 flex flex-1 flex-col gap-1.5">
          <div class="flex items-baseline gap-2">
            <span class="truncate text-sm color-base font-medium">{{ meta.login }}</span>
            <span v-if="meta.name" class="truncate text-xs color-faint">{{ meta.name }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-1">
            <DisplayBadge
              v-for="scope in meta.scopes"
              :key="scope"
              :text="scope"
              class="text-xs"
            />
            <span v-if="!meta.scopes.length" class="text-xs color-faint">{{ noScopes }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs color-faint">
            <span>
              {{ $t('settings.token.updated') }} <DisplayDate :date="meta.setAt" />
            </span>
            <span v-if="meta.expiresAt">
              {{ $t('settings.token.expires') }} <DisplayDate :date="meta.expiresAt" />
            </span>
            <span v-else>{{ $t('settings.token.neverExpires') }}</span>
          </div>
        </div>
        <ActionIconButton
          icon="i-ph:pencil-simple-duotone"
          :label="$t('settings.token.change')"
          :tooltip="$t('settings.token.change')"
          class="text-sm"
          @click="editing = true"
        />
      </div>

      <div v-else class="flex items-center gap-2 text-sm color-faint">
        <template v-if="busy">
          <span class="i-ph:circle-notch animate-spin" aria-hidden="true" />
          {{ $t('settings.token.checking') }}
        </template>
        <template v-else>
          <span class="flex-1 text-red-600 dark:text-red-400">{{ error ?? $t('settings.token.couldNotVerify') }}</span>
          <ActionIconButton
            icon="i-ph:pencil-simple-duotone"
            :label="$t('settings.token.change')"
            :tooltip="$t('settings.token.change')"
            class="text-sm"
            @click="editing = true"
          />
        </template>
      </div>
    </div>
  </FormField>
</template>
