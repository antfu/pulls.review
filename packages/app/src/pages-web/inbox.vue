<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppContext } from '../app-context'
import InboxPage from '../components/pulls/InboxPage.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle'
import { createInboxStore } from '../stores/inbox-store'

const { t } = useI18n()
const store = createInboxStore(useAppContext())

useDocumentTitle(() => t('inbox.title'))

onMounted(() => store.load())
</script>

<template>
  <main>
    <InboxPage :store="store" />
  </main>
</template>
