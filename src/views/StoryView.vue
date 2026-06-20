<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db } from '@/db'
import { useSessionStore } from '@/stores/session'
import { useLLM } from '@/composables/useLLM'
import { useClipboard } from '@/composables/useClipboard'
import type { Archive } from '@/types'
import { ArrowLeft } from 'lucide-vue-next'
import StoryHeader from '@/components/story/StoryHeader.vue'
import MessageList from '@/components/story/MessageList.vue'
import StoryFooter from '@/components/story/StoryFooter.vue'
import MessageContextMenu from '@/components/story/MessageContextMenu.vue'
import EditUserMsgModal from '@/components/story/EditUserMsgModal.vue'
import EditAiMsgModal from '@/components/story/EditAiMsgModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import MessageNavButtons from '@/components/story/MessageNavButtons.vue'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const { executeAiInference } = useLLM()
const { copyToClipboard } = useClipboard()

const archive = ref<Archive | null>(null)
const messageCount = ref(0)
const compressedCount = ref(0)
const messageListRef = ref<InstanceType<typeof MessageList> | null>(null)
const headerHidden = ref(false)
const footerVisible = ref(true)
const atBottom = ref(true)

function handleAtBottom(val: boolean) {
  atBottom.value = val
  footerVisible.value = val
}

// 右键菜单
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMsgId = ref<number | null>(null)
const contextMenuRole = ref<string>('user')
const resendTargetId = ref<number | null>(null)

// 编辑弹窗
const editUserMsgVisible = ref(false)
const editAiMsgVisible = ref(false)
const editMsgId = ref<number | null>(null)

// 删除确认
const deleteConfirmVisible = ref(false)
const deleteConfirmMsgId = ref<number | null>(null)

const archiveId = computed(() => Number(route.params.id))

async function loadArchive() {
  const a = await db.archives.get(archiveId.value)
  if (!a) {
    router.replace('/')
    return
  }
  archive.value = a
  sessionStore.currentArchiveId = a.id!
  sessionStore.selectedApiId = a.selectedApiId || null
  await updateCounts()
}

async function updateCounts() {
  const count = await db.messages.where('archiveId').equals(archiveId.value).count()
  const compressed = await db.messages
    .where('[archiveId+summaryStatus]')
    .equals([archiveId.value, '已总结'])
    .count()
  messageCount.value = count
  compressedCount.value = compressed
}

async function handleSend(displayText: string, expandedText: string) {
  if (!archive.value) return

  const userMsgId = await db.messages.add({
    archiveId: archiveId.value,
    role: 'user',
    content: displayText,
    timestamp: Date.now(),
    summaryStatus: '未操作',
  })

  await messageListRef.value?.appendUserMessage()

  try {
    const aiMsgId = await executeAiInference(archiveId.value)
    await messageListRef.value?.appendAiMessage()
    await updateCounts()
    await loadArchive()
  } catch {
    // 错误已在 executeAiInference 中处理
  }
}

async function handleContinue() {
  if (!archive.value) return

  try {
    const aiMsgId = await executeAiInference(archiveId.value, '请继续推进剧情...')
    await messageListRef.value?.appendAiMessage()
    await updateCounts()
    await loadArchive()
  } catch {
    // 错误已在 executeAiInference 中处理
  }
}

function onContextMenu(messageId: number, x: number, y: number, role: string) {
  contextMsgId.value = messageId
  contextMenuX.value = x
  contextMenuY.value = y
  contextMenuRole.value = role
  contextMenuVisible.value = true
}

function closeContextMenu() {
  contextMenuVisible.value = false
  contextMsgId.value = null
}

async function handleCopyMessage() {
  if (!contextMsgId.value) return
  const msg = await db.messages.get(contextMsgId.value)
  if (!msg) return

  await copyToClipboard(msg.content)
  closeContextMenu()
}

async function handleEditMessage() {
  if (!contextMsgId.value) return
  const msg = await db.messages.get(contextMsgId.value)
  if (!msg) return

  editMsgId.value = contextMsgId.value
  if (msg.role === 'user') {
    editUserMsgVisible.value = true
  } else {
    editAiMsgVisible.value = true
  }
  closeContextMenu()
}

async function handleResendFromHere() {
  if (!contextMsgId.value) return
  const targetId = contextMsgId.value
  resendTargetId.value = targetId
  closeContextMenu()

  // 删除当前及之后所有消息
  const msg = await db.messages.get(targetId)
  if (!msg) return

  const allMsgs = await db.messages
    .where('archiveId')
    .equals(archiveId.value)
    .sortBy('timestamp')

  const idx = allMsgs.findIndex(m => m.id === msg.id)
  if (idx === -1) return

  const toDelete = allMsgs.slice(idx)
  for (const m of toDelete) {
    await db.messages.delete(m.id!)
    messageListRef.value?.removeMessage(m.id!)
  }

  // 用被右键的用户消息内容重新发送
  await handleSend(msg.content, msg.content)
}

function handleDeleteMessage() {
  if (!contextMsgId.value) return
  deleteConfirmMsgId.value = contextMsgId.value
  deleteConfirmVisible.value = true
  closeContextMenu()
}

async function confirmDeleteMessage() {
  if (!deleteConfirmMsgId.value) return
  const msgId = deleteConfirmMsgId.value
  await db.messages.delete(msgId)
  messageListRef.value?.removeMessage(msgId)
  await updateCounts()
  deleteConfirmVisible.value = false
  deleteConfirmMsgId.value = null
}

async function saveEditedUserMsg(content: string) {
  if (editMsgId.value) {
    await db.messages.update(editMsgId.value, { content })
    messageListRef.value?.updateMessage(editMsgId.value)
  }
  editUserMsgVisible.value = false
  editMsgId.value = null
}

async function saveEditedAiMsg(content: string) {
  if (editMsgId.value) {
    await db.messages.update(editMsgId.value, { content })
    messageListRef.value?.updateMessage(editMsgId.value)
  }
  editAiMsgVisible.value = false
  editMsgId.value = null
}

onMounted(() => {
  loadArchive()
})
</script>

<template>
  <div v-if="archive" class="h-full flex flex-col overflow-hidden relative">
    <StoryHeader
      :archive="archive"
      :message-count="messageCount"
      :compressed-count="compressedCount"
      :class="headerHidden ? '-translate-y-full opacity-0' : ''"
      class="!absolute top-0 left-0 right-0 z-10 !bg-[var(--color-bg)] transition-all duration-500 ease-out"
    />

    <button
      class="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center bg-white/80 shadow-md hover:bg-white z-20 transition-all duration-350 ease-out"
      :class="headerHidden ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'"
      @click="router.back()"
    >
      <ArrowLeft :size="18" />
    </button>

    <MessageList
      ref="messageListRef"
      :archive-id="archiveId"
      :resend-target-id="resendTargetId"
      :footer-visible="footerVisible"
      @context-menu="onContextMenu"
      @header-hidden="headerHidden = $event"
      @at-bottom="handleAtBottom"
    />

    <StoryFooter
      :excluded-system-config-ids="archive?.referencedSystemConfigKeys ?? []"
      :class="footerVisible ? '' : 'translate-y-full opacity-0 pointer-events-none'"
      class="!absolute bottom-0 left-0 right-0 z-10 transition-all duration-500 ease-out"
      @send="handleSend"
      @continue="handleContinue"
    />

    <button
      class="absolute bottom-2 left-1/2 -translate-x-1/2 h-3 w-[30%] rounded-full bg-white/60 border border-white/80 shadow-md hover:bg-white/80 transition-all duration-500 ease-out z-20"
      :class="footerVisible ? 'opacity-0 pointer-events-none scale-x-0' : 'opacity-100 scale-x-100'"
      @click="footerVisible = true"
    ></button>

    <MessageNavButtons
      @prev="messageListRef?.scrollToPrevMessage()"
      @next="messageListRef?.scrollToNextMessage()"
      @bottom="messageListRef?.scrollToBottom()"
    />

    <!-- 右键菜单 -->
    <MessageContextMenu
      :visible="contextMenuVisible"
      :x="contextMenuX"
      :y="contextMenuY"
      :role="contextMenuRole"
      @edit="handleEditMessage"
      @resend="handleResendFromHere"
      @copy="handleCopyMessage"
      @delete="handleDeleteMessage"
      @close="closeContextMenu"
    />

    <!-- 编辑用户消息弹窗 -->
    <EditUserMsgModal
      :visible="editUserMsgVisible"
      :message-id="editMsgId"
      @close="editUserMsgVisible = false; editMsgId = null"
      @save="saveEditedUserMsg"
    />

    <!-- 编辑AI消息弹窗 -->
    <EditAiMsgModal
      :visible="editAiMsgVisible"
      :message-id="editMsgId"
      @close="editAiMsgVisible = false; editMsgId = null"
      @save="saveEditedAiMsg"
    />

    <!-- 删除确认弹窗 -->
    <ConfirmModal
      :visible="deleteConfirmVisible"
      title="删除消息"
      message="确认删除该消息？此操作不可撤销。"
      confirm-text="删除"
      cancel-text="取消"
      :danger="true"
      @confirm="confirmDeleteMessage"
      @cancel="deleteConfirmVisible = false; deleteConfirmMsgId = null"
    />
  </div>

  <div v-else class="h-full flex items-center justify-center text-[var(--color-text-muted)]">
    加载中...
  </div>
</template>
