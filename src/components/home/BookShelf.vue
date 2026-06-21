<script setup lang="ts">
import type { Archive } from '@/types'
import BookCard from './BookCard.vue'

defineProps<{
  archives: Array<{ archive: Archive; messageCount: number; lastUpdated: string }>
}>()

const emit = defineEmits<{
  select: [id: number]
  export: [id: number]
  delete: [id: number]
}>()
</script>

<template>
  <div class="book-shelf flex-1 overflow-y-auto">
    <BookCard
      v-for="item in archives"
      :key="item.archive.id"
      :archive="item.archive"
      :message-count="item.messageCount"
      :last-updated="item.lastUpdated"
      @click="emit('select', item.archive.id!)"
      @export="emit('export', item.archive.id!)"
      @delete="emit('delete', item.archive.id!)"
    />
    <div v-if="archives.length === 0" class="col-span-full flex items-center justify-center text-[var(--color-text-muted)] empty-state rounded-lg m-4">
      <div class="text-center py-12">
        <p class="text-base mb-2">书架空空如也</p>
        <p>点击「新建存档」开始你的冒险</p>
      </div>
    </div>
  </div>
</template>
