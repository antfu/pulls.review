<script setup lang="ts">
import type { CommitNav } from '../../composables/useCommitView'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import OverlayDropdown from '@antfu/design/components/Overlay/OverlayDropdown.vue'
import OverlayDropdownRadioGroup from '@antfu/design/components/Overlay/OverlayDropdownRadioGroup.vue'
import OverlayDropdownRadioItem from '@antfu/design/components/Overlay/OverlayDropdownRadioItem.vue'
import OverlayDropdownSeparator from '@antfu/design/components/Overlay/OverlayDropdownSeparator.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatTimeAgo } from '../../i18n/time-ago'
import GithubAvatar from '../GithubAvatar.vue'

const props = defineProps<{ nav: CommitNav }>()

const { t, locale } = useI18n()

// The radio group needs a value for "all changes"; a sha is never empty.
const ALL = ''

const index = computed(() => props.nav.commits.findIndex(commit => commit.sha === props.nav.selected))
const count = computed(() => props.nav.commits.length)

const label = computed(() => {
  if (!props.nav.selected)
    return t('commits.count', count.value)
  // A deep-linked sha outside the list (beyond GitHub's cap, or mistyped) still reads as a commit.
  return index.value === -1 ? props.nav.selected.slice(0, 7) : t('commits.position', { index: index.value + 1, total: count.value })
})

function step(offset: number) {
  props.nav.select(props.nav.commits[index.value + offset]?.sha)
}

function subject(message: string) {
  return message.split('\n', 1)[0]
}
</script>

<template>
  <span class="flex items-center gap-1">
    <ActionIconButton
      v-if="nav.selected"
      icon="i-ph:caret-left"
      compact
      :label="$t('commits.older')" :tooltip="$t('commits.older')"
      :disabled="index <= 0"
      @click="step(-1)"
    />
    <OverlayDropdown>
      <template #trigger>
        <ActionButton size="sm" icon="i-ph:git-commit-duotone">
          {{ label }}
        </ActionButton>
      </template>
      <OverlayDropdownRadioGroup :model-value="nav.selected ?? ALL" @update:model-value="nav.select($event || undefined)">
        <OverlayDropdownRadioItem :value="ALL">
          {{ $t('commits.all') }}
        </OverlayDropdownRadioItem>
        <OverlayDropdownSeparator />
        <div class="max-h-80 overflow-auto">
          <OverlayDropdownRadioItem v-for="commit in nav.commits" :key="commit.sha" :value="commit.sha">
            <span class="max-w-120 min-w-0 flex items-center gap-2" :title="commit.message">
              <GithubAvatar v-if="commit.author" :login="commit.author.name" :avatar-url="commit.author.avatarUrl" :size="16" />
              <span class="min-w-0 flex-1 truncate">{{ subject(commit.message) }}</span>
              <code class="shrink-0 text-xs font-mono op-fade">{{ commit.sha.slice(0, 7) }}</code>
              <time v-if="commit.date" :datetime="commit.date" class="shrink-0 text-xs op-fade">{{ formatTimeAgo(new Date(commit.date), locale) }}</time>
            </span>
          </OverlayDropdownRadioItem>
        </div>
      </OverlayDropdownRadioGroup>
    </OverlayDropdown>
    <ActionIconButton
      v-if="nav.selected"
      icon="i-ph:caret-right"
      compact
      :label="$t('commits.newer')" :tooltip="$t('commits.newer')"
      :disabled="index === -1 || index >= count - 1"
      @click="step(1)"
    />
  </span>
</template>
