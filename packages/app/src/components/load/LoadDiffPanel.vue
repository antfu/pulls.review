<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FormField from '@antfu/design/components/Form/FormField.vue'
import { ref } from 'vue'

const emit = defineEmits<{
  submit: [text: string, title?: string]
}>()

const text = ref('')
const isDragging = ref(false)

function submit() {
  if (!text.value.trim())
    return
  emit('submit', text.value)
}

async function handleFile(file: File) {
  text.value = await file.text()
}

function onDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file)
    handleFile(file)
}

function onFileInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file)
    handleFile(file)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <FormField :label="$t('load.pasteLabel')">
      <textarea
        v-model="text"
        rows="10"
        placeholder="diff --git a/foo b/foo…"
        class="w-full resize-y border border-base rounded bg-raised p-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        :class="{ 'border-primary-500 ring-2 ring-primary-500/40': isDragging }"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      />
    </FormField>
    <label class="cursor-pointer text-sm color-muted">
      {{ $t('load.chooseFile') }}
      <input type="file" accept=".diff,.patch,text/plain" class="hidden" @change="onFileInput">
    </label>
    <ActionButton variant="primary" :disabled="!text.trim()" @click="submit">
      {{ $t('load.loadButton') }}
    </ActionButton>
  </div>
</template>
