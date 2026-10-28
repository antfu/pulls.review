<script setup lang="ts">
import { useGithubAccount } from '../../composables/useGithubAccount'
import GithubAccountSettings from './GithubAccountSettings.vue'

// Shown inside DiffsPage's error fallback so a signed-out or expired GitHub
// session can be addressed without opening Settings.
const { account, busy, oauthAvailable, signIn, signOut } = useGithubAccount()
</script>

<template>
  <GithubAccountSettings
    :account="account"
    :busy="busy"
    :oauth-available="oauthAvailable"
    @sign-in="signIn"
    @sign-out="void signOut()"
  />
</template>
