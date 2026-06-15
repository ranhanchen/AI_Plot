<script setup lang="ts">
import type { ApiConfig } from '@/types'
import { Trash2, Eye, EyeOff, ChevronDown } from 'lucide-vue-next'
import { ref, computed } from 'vue'

const props = defineProps<{
  config: ApiConfig
  expanded: boolean
  fetching?: boolean
  testing?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  update: [config: ApiConfig]
  delete: [id: number]
  fetchModels: [config: ApiConfig]
  test: [config: ApiConfig]
}>()

const showKey = ref(false)
const showModelDropdown = ref(false)
const modelFilter = ref('')

const filteredModels = computed(() => {
  const list = props.config.modelsList
  if (!modelFilter.value) return list
  return list.filter(m => m.toLowerCase().includes(modelFilter.value.toLowerCase()))
})

function selectModel(m: string) {
  props.config.model = m
  modelFilter.value = ''
  showModelDropdown.value = false
  emitUpdate()
}

function onModelFocus() {
  modelFilter.value = ''
  showModelDropdown.value = true
}

function onModelInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  props.config.model = val
  modelFilter.value = val
  showModelDropdown.value = true
  emitUpdate()
}

function onModelBlur() {
  setTimeout(() => { showModelDropdown.value = false; modelFilter.value = '' }, 150)
}

function emitUpdate() {
  emit('update', { ...props.config })
}
</script>

<template>
  <div
    :class="[
      'border rounded-lg overflow-hidden transition-shadow',
      expanded ? 'border-[var(--color-accent)]/30 shadow-sm' : 'border-[var(--color-border)] hover:shadow-sm'
    ]"
  >
    <!-- 折叠标题栏 -->
    <div
      class="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer select-none"
      @click="emit('toggle')"
    >
      <span class="font-semibold text-sm">{{ config.name }}</span>
      <div class="flex items-center gap-2">
        <button
          class="text-red-400 hover:text-red-600 transition-colors"
          @click.stop="emit('delete', config.id!)"
        >
          <Trash2 :size="16" />
        </button>
        <ChevronDown
          :size="16"
          class="text-[var(--color-text-muted)] transition-transform duration-200"
          :class="{ 'rotate-180': expanded }"
        />
      </div>
    </div>

    <!-- 展开详情 -->
    <div v-if="expanded" class="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3 bg-[var(--color-bg)]/50">
      <div>
        <label class="block text-xs text-[var(--color-text-secondary)] mb-1">配置名称</label>
        <input
          :value="config.name"
          type="text"
          class="w-full bg-[var(--color-bg)] rounded-lg px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10 focus:outline-none transition-shadow text-sm"
          placeholder="配置名称"
          @input="(e) => { config.name = (e.target as HTMLInputElement).value; emitUpdate() }"
        />
      </div>

      <div>
        <label class="block text-xs text-[var(--color-text-secondary)] mb-1">Base URL</label>
        <input
          :value="config.baseUrl"
          type="text"
          class="w-full bg-[var(--color-bg)] rounded-lg px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10 focus:outline-none transition-shadow text-sm"
          placeholder="https://api.openai.com"
          @input="(e) => { config.baseUrl = (e.target as HTMLInputElement).value; emitUpdate() }"
        />
      </div>

      <div>
        <label class="block text-xs text-[var(--color-text-secondary)] mb-1">API Key</label>
        <div class="flex gap-2">
          <input
            :value="config.apiKey"
            :type="showKey ? 'text' : 'password'"
            class="flex-1 bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
            placeholder="sk-..."
            @input="(e) => { config.apiKey = (e.target as HTMLInputElement).value; emitUpdate() }"
          />
          <button
            class="px-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            @click="showKey = !showKey"
          >
            <EyeOff v-if="showKey" :size="18" />
            <Eye v-else :size="18" />
          </button>
        </div>
      </div>

      <div>
        <label class="block text-xs text-[var(--color-text-secondary)] mb-1">模型</label>
        <div class="flex gap-2">
          <div class="flex-1 relative">
            <input
              :value="config.model"
              type="text"
              class="w-full bg-[var(--color-bg)] rounded px-3 py-1.5 border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-sm"
              placeholder="输入或选择模型"
              @input="onModelInput"
              @focus="onModelFocus"
              @blur="onModelBlur"
            />
            <div
              v-if="showModelDropdown && filteredModels.length > 0"
              class="absolute left-0 right-0 top-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-md z-50 max-h-60 overflow-y-auto"
            >
              <div
                v-for="m in filteredModels"
                :key="m"
                class="px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--color-surface-hover)]"
                @mousedown.prevent="selectModel(m)"
              >
                {{ m }}
              </div>
            </div>
          </div>
          <button
            class="px-3 py-1.5 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors shrink-0 disabled:opacity-50 text-xs"
            :disabled="fetching"
            @click="emit('fetchModels', config)"
          >
            {{ fetching ? '拉取中...' : '拉取模型' }}
          </button>
        </div>
      </div>

      <div>
        <label class="block text-xs text-[var(--color-text-secondary)] mb-1">
          温度: {{ config.temperature.toFixed(1) }}
        </label>
        <input
          :value="config.temperature"
          type="range"
          min="0"
          max="2"
          step="0.1"
          class="w-full accent-[var(--color-accent)]"
          @input="(e) => { config.temperature = parseFloat((e.target as HTMLInputElement).value); emitUpdate() }"
        />
      </div>

      <button
        class="w-full py-1.5 rounded border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white transition-colors disabled:opacity-50 text-xs"
        :disabled="testing"
        @click="emit('test', config)"
      >
        {{ testing ? '测试中...' : '测试连接' }}
      </button>
    </div>
  </div>
</template>
