<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { db } from '@/db'
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'
import type { SystemConfigItem } from '@/types'
import { Send, Play } from 'lucide-vue-next'

const DEFAULT_SYSTEM_KEYS = ['AI 剧情推动提示词', 'AI 总结提示词', 'AI 角色生成提示词']

const props = defineProps<{
  excludedSystemConfigIds: number[]
}>()

const emit = defineEmits<{
  send: [displayText: string, expandedText: string]
  continue: []
}>()

const editorRef = ref<HTMLDivElement>()
const dropdownRef = ref<HTMLDivElement>()
const sessionStore = useSessionStore()
const { isGenerating } = storeToRefs(sessionStore)

const editorText = ref('')
const showDropdown = ref(false)
const dropdownItems = ref<SystemConfigItem[]>([])
const selectedDropdownIndex = ref(0)

const sendDisabled = computed(() => !editorText.value.trim() || isGenerating.value)
const continueDisabled = computed(() => isGenerating.value)

let savedRange: Range | null = null
let isInserting = false

function autoResize() {
  const el = editorRef.value
  if (!el) return
  el.style.overflow = 'hidden'
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  el.style.overflow = el.scrollHeight > 160 ? 'auto' : 'hidden'
}

interface CursorTextInfo {
  node: Text
  textBeforeCursor: string
}

function getCursorTextInfo(): CursorTextInfo | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  const node = range.startContainer

  if (node.nodeType === Node.TEXT_NODE && editorRef.value?.contains(node)) {
    return {
      node: node as Text,
      textBeforeCursor: node.textContent!.substring(0, range.startOffset),
    }
  }

  return null
}

async function checkSlashMode() {
  const info = getCursorTextInfo()
  if (!info) {
    closeDropdown()
    return
  }

  const lastSlashIdx = info.textBeforeCursor.lastIndexOf('/')
  if (lastSlashIdx < 0) {
    closeDropdown()
    return
  }

  const searchTerm = info.textBeforeCursor.substring(lastSlashIdx + 1)
  if (searchTerm.includes(' ') || searchTerm.includes('\n')) {
    closeDropdown()
    return
  }

  // Save range for mouse-based selection
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    savedRange = selection.getRangeAt(0).cloneRange()
  }

  await loadDropdownItems(searchTerm)
}

async function loadDropdownItems(searchTerm: string) {
  const allConfigs = await db.systemConfigs.toArray()

  dropdownItems.value = allConfigs.filter(c => {
    if (c.id === undefined) return false
    if (DEFAULT_SYSTEM_KEYS.includes(c.key)) return false
    if (props.excludedSystemConfigIds.includes(c.id)) return false
    if (searchTerm) {
      const matchKey = c.key.includes(searchTerm)
      const matchRemark = (c.remark || '').includes(searchTerm)
      if (!matchKey && !matchRemark) return false
    }
    return true
  })

  selectedDropdownIndex.value = 0
  showDropdown.value = true
}

function closeDropdown() {
  showDropdown.value = false
  dropdownItems.value = []
  selectedDropdownIndex.value = 0
  savedRange = null
}

function insertTempRef(item: SystemConfigItem, useSavedRange = false) {
  isInserting = true

  let range: Range
  if (useSavedRange && savedRange) {
    range = savedRange
  } else {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      isInserting = false
      return
    }
    range = selection.getRangeAt(0)
  }

  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE) {
    isInserting = false
    return
  }

  const text = node.textContent!
  const cursorPos = range.startOffset
  const textBeforeCursor = text.substring(0, cursorPos)
  const lastSlashIdx = textBeforeCursor.lastIndexOf('/')

  if (lastSlashIdx < 0) {
    isInserting = false
    return
  }

  const deleteRange = document.createRange()
  deleteRange.setStart(node, lastSlashIdx)
  deleteRange.setEnd(node, cursorPos)
  deleteRange.deleteContents()

  const span = document.createElement('span')
  span.className = 'temp-ref'
  span.contentEditable = 'false'
  span.dataset.configId = String(item.id)
  span.dataset.configKey = item.key
  span.dataset.configValue = item.value
  span.textContent = '/' + item.key

  const insertRange = document.createRange()
  insertRange.setStart(deleteRange.startContainer, deleteRange.startOffset)
  insertRange.collapse(true)
  insertRange.insertNode(span)

  const newRange = document.createRange()
  newRange.setStartAfter(span)
  newRange.collapse(true)
  const selection = window.getSelection()
  if (selection) {
    selection.removeAllRanges()
    selection.addRange(newRange)
  }

  closeDropdown()
  editorRef.value?.focus()

  editorText.value = editorRef.value?.innerText || ''
  autoResize()
  isInserting = false
}

function onInput() {
  if (isInserting) return
  editorText.value = editorRef.value?.innerText || ''
  autoResize()
  checkSlashMode()
}

function onKeydown(e: KeyboardEvent) {
  if (showDropdown.value && dropdownItems.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedDropdownIndex.value = Math.min(selectedDropdownIndex.value + 1, dropdownItems.value.length - 1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedDropdownIndex.value = Math.max(selectedDropdownIndex.value - 1, 0)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const item = dropdownItems.value[selectedDropdownIndex.value]
      if (item) {
        insertTempRef(item)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closeDropdown()
      return
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain')
  if (!text) return

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  range.deleteContents()
  range.insertNode(document.createTextNode(text))
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)

  onInput()
}

function buildExpandedText(): string {
  const editor = editorRef.value
  if (!editor) return ''

  const configParts: string[] = []
  const textParts: string[] = []

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      textParts.push(node.textContent || '')
    } else if (node instanceof HTMLElement && node.classList.contains('temp-ref')) {
      const key = node.dataset.configKey
      const value = node.dataset.configValue
      if (key && value) {
        configParts.push(`【${key}】\n${value}`)
      }
    } else {
      for (const child of node.childNodes) {
        walk(child)
      }
    }
  }

  for (const child of editor.childNodes) {
    walk(child)
  }

  let result = textParts.join('')
  if (configParts.length > 0) {
    result += '\n\n' + configParts.join('\n\n')
  }
  return result
}

function handleSend() {
  if (sendDisabled.value) return

  const displayText = editorRef.value?.innerText || ''
  const expandedText = buildExpandedText()

  emit('send', displayText, expandedText)

  if (editorRef.value) {
    editorRef.value.innerHTML = ''
    editorText.value = ''
    autoResize()
  }
}

function handleContinue() {
  if (continueDisabled.value) return
  emit('continue')
}

function onClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    closeDropdown()
  }
}

function scrollDropdownIntoView() {
  if (!dropdownRef.value) return
  const activeItem = dropdownRef.value.querySelector('.dropdown-item-active')
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest' })
  }
}

// Watch selectedDropdownIndex to scroll into view
import { watch } from 'vue'
watch(selectedDropdownIndex, () => {
  scrollDropdownIntoView()
})

onMounted(() => {
  document.addEventListener('click', onClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
})
</script>

<template>
  <footer
    class="flex items-end gap-2 sm:gap-3 px-2 sm:px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)] shrink-0 relative"
  >
    <button
      class="flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-black/[0.06] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      :disabled="continueDisabled"
      @click="handleContinue"
    >
      <Play :size="16" />
      <span class="hidden sm:inline">继续</span>
    </button>

    <div class="flex-1 relative">
      <div
        ref="editorRef"
        contenteditable="true"
        class="px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
        data-placeholder="输入你的行动..."
        @input="onInput"
        @keydown="onKeydown"
        @paste="onPaste"
      />

      <div
        v-if="showDropdown && dropdownItems.length > 0"
        ref="dropdownRef"
        class="absolute left-0 right-0 bottom-full mb-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg max-h-48 overflow-y-auto z-50"
      >
        <div
          v-for="(item, idx) in dropdownItems"
          :key="item.id"
          :class="[
            'px-3 py-2 cursor-pointer text-sm transition-colors',
            idx === selectedDropdownIndex ? 'dropdown-item-active bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'hover:bg-[var(--color-surface-hover)]',
          ]"
          @mousedown.prevent="insertTempRef(item, true)"
        >
          <span class="font-medium">{{ item.remark || item.key }}</span>
          <span v-if="item.remark && item.remark !== item.key" class="ml-2 text-xs text-[var(--color-text-muted)]">{{ item.key }}</span>
        </div>
      </div>
    </div>

    <button
      class="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md bg-[var(--color-accent)] text-white text-sm hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      :disabled="sendDisabled"
      @click="handleSend"
    >
      <Send :size="14" />
      <span class="hidden sm:inline">发送</span>
    </button>
  </footer>
</template>

<style>
.temp-ref {
  color: #2563eb;
  font-weight: 500;
}

[contenteditable]:empty:before {
  content: attr(data-placeholder);
  color: var(--color-text-muted, #947a6a);
  pointer-events: none;
}
</style>
