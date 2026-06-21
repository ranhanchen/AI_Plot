<script setup lang="ts">
import Toast from '@/components/common/Toast.vue'
</script>

<template>
  <div class="h-full w-full flex flex-col">
    <router-view v-slot="{ Component }">
      <keep-alive :include="['StoryView']">
        <component :is="Component" />
      </keep-alive>
    </router-view>
    <Toast />
  </div>
</template>
