<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated, onDeactivated, onBeforeUnmount, nextTick } from 'vue'
import type { Message } from '@/types'
import { db } from '@/db'
import UserMessage from './UserMessage.vue'
import AiMessage from './AiMessage.vue'
import TypingIndicator from '@/components/common/TypingIndicator.vue'
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'

const props = defineProps<{
  archiveId: number
  resendTargetId: number | null
  footerVisible: boolean
}>()

const emit = defineEmits<{
  contextMenu: [messageId: number, x: number, y: number, role: string]
  resendDone: []
  headerHidden: [hidden: boolean]
  atBottom: [atBottom: boolean]
}>()

const messages = ref<Message[]>([])
const sessionStore = useSessionStore()
const { isGenerating, generatingSeconds } = storeToRefs(sessionStore)
const listRef = ref<HTMLElement>()
const trackRef = ref<HTMLElement>()

// 长按菜单（移动端）
const longPressTimers = new Map<number, ReturnType<typeof setTimeout>>()

function onPointerDown(msgId: number, e: PointerEvent) {
  longPressTimers.set(msgId, setTimeout(() => {
    const msg = messages.value.find(m => m.id === msgId)
    emit('contextMenu', msgId, e.clientX, e.clientY, msg?.role || 'user')
    longPressTimers.delete(msgId)
  }, 500))
}

function onPointerUpOrLeave(msgId: number) {
  const timer = longPressTimers.get(msgId)
  if (timer) {
    clearTimeout(timer)
    longPressTimers.delete(msgId)
  }
}

// 滚动条状态
const scrollTop = ref(0)
const scrollHeight = ref(0)
const clientHeight = ref(0)
const showScrollbar = ref(false)
const hoveringScrollbar = ref(false)
const dragging = ref(false)
const headerHidden = ref(false)
const atBottomLocal = ref(true)
let scrollTimer: ReturnType<typeof setTimeout> | null = null
let scrollbarHoverTimer: ReturnType<typeof setTimeout> | null = null
let dragStartY = 0
let dragStartScrollTop = 0
let lastScrollTop = 0
let isRestoring = false

const maxScrollTop = computed(() => Math.max(scrollHeight.value - clientHeight.value, 0))

const thumbHeightPct = computed(() => {
  if (scrollHeight.value <= clientHeight.value) return 100
  return Math.max((clientHeight.value / scrollHeight.value) * 100, 8)
})

const thumbTopPct = computed(() => {
  if (maxScrollTop.value <= 0) return 0
  return (scrollTop.value / maxScrollTop.value) * (100 - thumbHeightPct.value)
})

const trackStyle = computed(() => ({
  top: headerHidden.value ? '0px' : '88px',
  bottom: props.footerVisible ? '80px' : '0px',
}))

function onScrollbarEnter() {
  hoveringScrollbar.value = true
  if (scrollbarHoverTimer) {
    clearTimeout(scrollbarHoverTimer)
    scrollbarHoverTimer = null
  }
}

function onScrollbarLeave() {
  scrollbarHoverTimer = setTimeout(() => {
    hoveringScrollbar.value = false
  }, 1000)
}

function updateMetrics() {
  nextTick().then(() => {
    const el = listRef.value
    if (!el) return
    scrollTop.value = el.scrollTop
    scrollHeight.value = el.scrollHeight
    clientHeight.value = el.clientHeight
  })
}

function onNativeScroll() {
  const el = listRef.value
  if (!el) return
  scrollTop.value = el.scrollTop
  saveScrollPos()
  showScrollbar.value = true
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    if (!dragging.value) showScrollbar.value = false
  }, 1000)

  const st = el.scrollTop
  const delta = st - lastScrollTop

  const isAtBottom = (el.scrollHeight - st - el.clientHeight) < 12
  atBottomLocal.value = isAtBottom

  console.log('[onNativeScroll] st:', st, 'delta:', delta, 'lastScrollTop:', lastScrollTop, 'isAtBottom:', isAtBottom, 'isRestoring:', isRestoring, 'headerHidden:', headerHidden.value)

  if (!isRestoring) {
    emit('atBottom', isAtBottom)
  } else {
    console.log('[onNativeScroll] isRestoring=TRUE, skipping emit atBottom')
  }

  if (!isRestoring) {
    if (delta > 8) {
      if (!headerHidden.value) {
        headerHidden.value = true
        emit('headerHidden', true)
        console.log('[onNativeScroll] emit headerHidden=true')
      }
    } else if (delta < -4) {
      if (headerHidden.value) {
        headerHidden.value = false
        emit('headerHidden', false)
        console.log('[onNativeScroll] emit headerHidden=false')
      }
    }
  }
  lastScrollTop = st
}

// 拖拽
function onThumbMouseDown(e: MouseEvent) {
  dragging.value = true
  dragStartY = e.clientY
  dragStartScrollTop = listRef.value!.scrollTop
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  const el = listRef.value
  const track = trackRef.value
  if (!el || !track) return
  const deltaY = e.clientY - dragStartY
  const trackH = track.clientHeight
  const thumbH = (thumbHeightPct.value / 100) * trackH
  const visibleTrack = trackH - thumbH
  if (visibleTrack <= 0) return
  el.scrollTop = dragStartScrollTop + (deltaY / visibleTrack) * maxScrollTop.value
  saveScrollPos()
}

function onMouseUp() {
  dragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    showScrollbar.value = false
  }, 1000)
}

// 点击 track 跳转
function onTrackMouseDown(e: MouseEvent) {
  if (e.target !== e.currentTarget) return
  const el = listRef.value
  const track = trackRef.value
  if (!el || !track) return
  const rect = track.getBoundingClientRect()
  const ratio = (e.clientY - rect.top) / track.clientHeight
  el.scrollTop = ratio * maxScrollTop.value
}

watch(messages, () => updateMetrics())

function getScrollKey() {
  return `scrollPos_${props.archiveId}`
}

function saveScrollPos() {
  if (listRef.value) {
    sessionStorage.setItem(getScrollKey(), String(listRef.value.scrollTop))
    console.log('[saveScrollPos] key:', getScrollKey(), 'value:', listRef.value.scrollTop)
  }
}

function restoreScrollPos() {
  const saved = sessionStorage.getItem(getScrollKey())
  console.log('[restoreScrollPos] key:', getScrollKey(), 'saved:', saved, 'listRef:', !!listRef.value, 'headerHidden:', headerHidden.value, 'atBottomLocal:', atBottomLocal.value)
  if (!saved) { console.log('[restoreScrollPos] no saved pos'); return false }
  const pos = Number(saved)
  if (!pos || pos <= 0) { console.log('[restoreScrollPos] invalid pos'); return false }
  console.log('[restoreScrollPos] setting isRestoring=true')
  isRestoring = true
  nextTick(() => {
    console.log('[restoreScrollPos] nextTick, listRef:', !!listRef.value, 'scrollHeight:', listRef.value?.scrollHeight, 'clientHeight:', listRef.value?.clientHeight)
    requestAnimationFrame(() => {
      console.log('[restoreScrollPos] rAF, listRef:', !!listRef.value, 'scrollHeight:', listRef.value?.scrollHeight, 'clientHeight:', listRef.value?.clientHeight)
      if (listRef.value) {
        lastScrollTop = pos
        listRef.value.scrollTop = pos
        console.log('[restoreScrollPos] set scrollTop=', pos, 'actual scrollTop=', listRef.value.scrollTop)
        requestAnimationFrame(() => {
          isRestoring = false
          console.log('[restoreScrollPos] isRestoring=false (delayed)')
        })
      } else {
        isRestoring = false
      }
    })
  })
  return true
}

onDeactivated(() => {
  console.log('[onDeactivated] scrollTop:', listRef.value?.scrollTop)
})

onActivated(() => {
  console.log('[onActivated]')
  restoreScrollPos()
})

onMounted(() => {
  console.log('[onMounted]')
  loadMessages().then(() => {
    const restored = restoreScrollPos()
    console.log('[onMounted] restored:', restored)
    if (!restored) {
      scrollToBottom(false)
    }
    updateMetrics()
    nextTick().then(() => {
      lastScrollTop = listRef.value?.scrollTop || 0
    })
  })
})

onBeforeUnmount(() => {
  for (const timer of longPressTimers.values()) {
    clearTimeout(timer)
  }
  longPressTimers.clear()
  if (scrollTimer) clearTimeout(scrollTimer)
  if (scrollbarHoverTimer) clearTimeout(scrollbarHoverTimer)
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})

async function loadMessages() {
  messages.value = await db.messages
    .where('archiveId')
    .equals(props.archiveId)
    .sortBy('timestamp')
}

async function scrollToBottom(smooth = true) {
  nextTick().then(() => {
    const el = listRef.value
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' })
    }
  })
}

function scrollToPrevMessage() {
  const el = listRef.value
  if (!el) return
  const items = el.querySelectorAll('[data-message-id]')
  if (items.length === 0) return
  const st = el.scrollTop
  let target: Element | null = null
  for (let i = items.length - 1; i >= 0; i--) {
    const rect = (items[i] as HTMLElement).getBoundingClientRect()
    const containerRect = el.getBoundingClientRect()
    const itemTop = rect.top - containerRect.top + st
    if (itemTop < st - 10) {
      target = items[i]
      break
    }
  }
  if (target) {
    if (target === items[0]) {
      el.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      ;(target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
}

function scrollToNextMessage() {
  const el = listRef.value
  if (!el) return
  const items = el.querySelectorAll('[data-message-id]')
  if (items.length === 0) return
  const st = el.scrollTop
  for (let i = 0; i < items.length; i++) {
    const rect = (items[i] as HTMLElement).getBoundingClientRect()
    const containerRect = el.getBoundingClientRect()
    const itemTop = rect.top - containerRect.top + st
    if (itemTop > st + 10) {
      if (items[i] === items[items.length - 1]) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        ;(items[i] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }
  }
  scrollToBottom()
}

async function appendUserMessage() {
  const msgs = await db.messages
    .where('archiveId')
    .equals(props.archiveId)
    .sortBy('timestamp')
  const last = msgs.filter(m => m.role === 'user').pop()
  if (last) {
    messages.value.push(last)
    await scrollToBottom()
  }
}

async function appendAiMessage() {
  const msgs = await db.messages
    .where('archiveId')
    .equals(props.archiveId)
    .sortBy('timestamp')
  const last = msgs.filter(m => m.role === 'assistant').pop()
  if (last) {
    messages.value.push(last)
  }
}

function updateMessage(id: number) {
  const idx = messages.value.findIndex(m => m.id === id)
  if (idx !== -1) {
    db.messages.get(id).then(msg => {
      if (msg) messages.value[idx] = msg
    })
  }
}

function removeMessage(id: number) {
  const idx = messages.value.findIndex(m => m.id === id)
  if (idx !== -1) {
    messages.value.splice(idx, 1)
  }
}

function onContextMenu(messageId: number, e: MouseEvent) {
  e.preventDefault()
  const msg = messages.value.find(m => m.id === messageId)
  emit('contextMenu', messageId, e.clientX, e.clientY, msg?.role || 'user')
}

defineExpose({
  loadMessages,
  appendUserMessage,
  appendAiMessage,
  updateMessage,
  removeMessage,
  scrollToBottom,
  scrollToPrevMessage,
  scrollToNextMessage,
})
</script>

<template>
  <div class="flex-1 relative overflow-hidden">
    <div
      ref="listRef"
      class="h-full overflow-y-auto pt-[88px] pb-[80px] custom-scrollbar"
      @scroll="onNativeScroll"
    >
      <div
        v-for="msg in messages"
        :key="msg.id"
        :data-message-id="msg.id"
        @pointerdown="onPointerDown(msg.id!, $event)"
        @pointerup="onPointerUpOrLeave(msg.id!)"
        @pointerleave="onPointerUpOrLeave(msg.id!)"
        @pointercancel="onPointerUpOrLeave(msg.id!)"
      >
        <UserMessage
          v-if="msg.role === 'user'"
          :message="msg"
          @contextmenu="onContextMenu(msg.id!, $event)"
        />
        <AiMessage
          v-else
          :message="msg"
          @contextmenu="onContextMenu(msg.id!, $event)"
        />
      </div>
      <TypingIndicator v-if="isGenerating" :seconds="generatingSeconds" />
      <div
        v-if="messages.length === 0 && !isGenerating"
        class="flex items-center justify-center h-full text-[var(--color-text-muted)] text-sm sm:text-base"
      >
        尚未开始剧情，请在下方输入框发送消息
      </div>
    </div>

    <!-- 自定义滚动条 -->
    <div
      ref="trackRef"
      class="absolute right-[3px] w-[4px] z-10 transition-all duration-500"
      :style="trackStyle"
      :class="showScrollbar || dragging || hoveringScrollbar ? 'opacity-100' : 'opacity-0'"
      @mouseenter="onScrollbarEnter"
      @mouseleave="onScrollbarLeave"
      @mousedown="onTrackMouseDown"
    >
      <div
        class="absolute w-full rounded-full cursor-pointer transition-colors"
        :style="{
          top: thumbTopPct + '%',
          height: thumbHeightPct + '%',
          background: dragging ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.15)',
        }"
        @mousedown.stop="onThumbMouseDown"
      ></div>
    </div>
  </div>
</template>
