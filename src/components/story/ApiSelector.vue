<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { db } from '@/db'
import { useSessionStore } from '@/stores/session'
import type { ApiConfig } from '@/types'
import { ChevronDown } from 'lucide-vue-next'

const sessionStore = useSessionStore()
const configs = ref<ApiConfig[]>([])
const showDropdown = ref(false)
const currentName = ref('未选择 API')

async function loadConfigs() {
  configs.value = await db.apiConfigs.toArray()
  if (sessionStore.selectedApiId) {
    const cfg = configs.value.find(c => c.id === sessionStore.selectedApiId)
    if (cfg) currentName.value = cfg.name
  }
}

function selectConfig(config: ApiConfig) {
  sessionStore.selectedApiId = config.id!
  currentName.value = config.name
  showDropdown.value = false

  if (sessionStore.currentArchiveId) {
    db.archives.update(sessionStore.currentArchiveId, { selectedApiId: config.id })
  }
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
  if (showDropdown.value) loadConfigs()
}

function onBlur() {
  setTimeout(() => { showDropdown.value = false }, 200)
}

onMounted(() => {
  loadConfigs()
})
</script>

<template>
  <div class="relative">
    <button
      class="flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors sm:max-w-[140px] truncate"
      @click="toggleDropdown"
      @blur="onBlur"
    >
      <span class="truncate">{{ currentName }}</span>
      <ChevronDown :size="12" class="shrink-0" />
    </button>
    <Transition name="dropdown">
      <div
        v-if="showDropdown"
        class="absolute right-0 top-full mt-1 w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-md z-50 max-h-60 overflow-y-auto"
      >
        <div
          v-for="cfg in configs"
          :key="cfg.id"
          :class="[
            'px-3 py-2 text-sm cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors',
            cfg.id === sessionStore.selectedApiId ? 'text-[var(--color-accent)] font-medium' : 'text-[var(--color-text-primary)]'
          ]"
          @click="selectConfig(cfg)"
        >
          {{ cfg.name }}
        </div>
        <div v-if="configs.length === 0" class="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center">
          暂无 API 配置
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
