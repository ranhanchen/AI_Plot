<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '@/db'
import { useAppStore } from '@/stores/app'
import { useArchiveIO } from '@/composables/useArchiveIO'
import { preloadImages } from '@/composables/useImagePreload'
import type { Archive } from '@/types'
import { Settings, Plus } from 'lucide-vue-next'
import BookShelf from '@/components/home/BookShelf.vue'
import NewArchiveModal from '@/components/home/NewArchiveModal.vue'
import ImportArchiveBtn from '@/components/home/ImportArchiveBtn.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const router = useRouter()
const appStore = useAppStore()
const { exportArchive, importArchive } = useArchiveIO()

const archives = ref<Array<{ archive: Archive; messageCount: number; lastUpdated: string }>>([])
const showNewModal = ref(false)
const deleteTarget = ref<{ id: number; title: string } | null>(null)
const exportTargetId = ref<number | null>(null)

async function loadArchives() {
  const raw = await db.archives.orderBy('createdAt').reverse().toArray()
  const enriched = await Promise.all(
    raw.map(async (archive) => {
      const count = await db.messages.where('archiveId').equals(archive.id!).count()
      const lastMsg = await db.messages
        .where('archiveId').equals(archive.id!)
        .reverse().sortBy('timestamp')
      const lastUpdated = lastMsg.length > 0
        ? new Date(lastMsg[0].timestamp).toLocaleDateString('zh-CN')
        : new Date(archive.createdAt).toLocaleDateString('zh-CN')
      return { archive, messageCount: count, lastUpdated }
    })
  )
  archives.value = enriched
}

async function preloadSystemRoleImages() {
  const all = await db.characterRoles.toArray()
  const systemRoles = all.filter(r => !r.archiveId)
  preloadImages(systemRoles.flatMap(r => r.images || []))
}

async function createArchive(title: string) {
  const allArchives = await db.archives.orderBy('createdAt').reverse().toArray()
  const latest = allArchives[0]

  const newArchive: Omit<Archive, 'id'> = {
    title,
    createdAt: Date.now(),
    selectedApiId: latest?.selectedApiId,
    promptStory: latest?.promptStory || '你是一个专业的剧情跑团主持人（GM）。请根据用户的行动和选择，推进剧情发展。\n\n【回复格式要求】\n你的每次回复必须严格遵循以下格式来组织内容，不同类型的段落使用不同的前缀标记：\n\n1. 系统公告：以 [系统公告] 开头，用于提示重要的系统信息（如属性变化、状态异常、章节标题等）\n   示例：[系统公告]你的生命值减少了5点\n\n2. 角色对话：以 角色名说： 开头，用于角色的台词\n   示例：村长说：勇士们，前方就是龙穴了\n\n3. 动作描写：以 [动作] 开头，用于描述角色的具体行为\n   示例：[动作]他缓缓拔出腰间的长剑\n\n4. 场景旁白：不加任何前缀，用于环境描写、氛围渲染、剧情推进等叙述性内容\n   示例：夕阳将城堡染成了血红色，远处传来低沉的雷鸣\n\n【主持要求】\n1. 营造沉浸式的场景氛围，用生动的描写让玩家身临其境\n2. 合理控制剧情节奏，适时引入冲突、悬念和转折\n3. 扮演所有NPC角色，每个角色需有鲜明的性格和对话风格\n4. 对玩家的行动做出合理的反应，保持世界的逻辑自洽\n5. 在关键节点提供有意义的选择，让玩家推动故事走向',
    promptSummary: latest?.promptSummary || '请对以下对话内容进行要点总结，按以下格式输出（每个字段以"当前状态："、"完整剧情脉络："、"出现过的角色："、"关键角色关系："、"关键信息："开头）：\n\n当前状态：简要描述当前场景和角色的即时状态\n完整剧情脉络：梳理剧情发展的关键节点\n出现过的角色：列出所有出场角色及其简要特征\n关键角色关系：记录角色之间的重要关系变化\n关键信息：提取可能影响后续剧情的重要情报',
    worldSetting: latest?.worldSetting || '',
    writingStyle: latest?.writingStyle || '使用生动形象的中文进行描写，注重细节刻画和氛围营造。对话需符合角色性格，旁白需有画面感。',
    outputLimit: latest?.outputLimit || '每次回复控制在300-800字之间，关键剧情节点可适当延长至1200字。',
    privateConfigs: latest?.privateConfigs ? [...latest.privateConfigs] : [],
    worldConfigs: latest?.worldConfigs ? [...latest.worldConfigs] : [],
    referencedSystemConfigKeys: latest?.referencedSystemConfigKeys ? [...latest.referencedSystemConfigKeys] : [],
    referencedSystemRoleIds: latest?.referencedSystemRoleIds ? [...latest.referencedSystemRoleIds] : [],
    memory: {
      currentStatus: '',
      plotLine: '',
      characterRelations: '',
      pendingIssues: '',
      keyInfo: '',
    },
    tokenStats: {
      missCost: 0,
      hitCost: 0,
      outputCost: 0,
    },
  }

  await db.archives.add(newArchive as Archive)
  showNewModal.value = false
  appStore.showToast('存档创建成功', 'success')
  await loadArchives()
}

async function handleImport(file: File) {
  try {
    await importArchive(file)
    appStore.showToast('存档导入成功', 'success')
    await loadArchives()
  } catch {
    appStore.showToast('存档导入失败，请检查文件格式', 'error')
  }
}

async function handleExport(archiveId: number) {
  const archive = await db.archives.get(archiveId)
  if (!archive) return
  exportArchiveTitle.value = archive.title
  exportTargetId.value = archiveId
}

async function confirmExport() {
  if (exportTargetId.value !== null) {
    await exportArchive(exportTargetId.value)
    appStore.showToast('存档导出成功', 'success')
    exportTargetId.value = null
  }
}

async function confirmDelete() {
  if (deleteTarget.value) {
    await db.messages.where('archiveId').equals(deleteTarget.value.id).delete()
    await db.archives.delete(deleteTarget.value.id)
    appStore.showToast('存档已删除', 'success')
    deleteTarget.value = null
    await loadArchives()
  }
}

function goStory(id: number) {
  router.push(`/story/${id}`)
}

const exportArchiveTitle = ref('')

onMounted(() => {
  loadArchives()
  preloadSystemRoleImages()
})
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 顶部操作栏 -->
    <header class="flex items-center justify-between px-3 sm:px-6 py-4 page-header shrink-0">
      <h1 class="text-lg font-bold text-[var(--color-accent)]">NarrativeForge</h1>
      <div class="flex items-center gap-3">
        <button
          class="flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-md bg-[var(--color-accent)] text-white text-sm hover:opacity-90 transition-colors"
          @click="showNewModal = true"
        >
          <Plus :size="16" />
          <span class="hidden sm:inline">新建存档</span>
        </button>
        <ImportArchiveBtn @import="handleImport" />
        <button
          class="flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-black/[0.06] transition-colors"
          @click="router.push('/settings')"
        >
          <Settings :size="16" />
          <span class="hidden md:inline">系统配置</span>
        </button>
      </div>
    </header>

    <!-- 书架区域 -->
    <BookShelf
      :archives="archives"
      @select="goStory"
      @export="handleExport"
      @delete="(id) => { const a = archives.find(x => x.archive.id === id); if (a) deleteTarget = { id, title: a.archive.title } }"
    />

    <!-- 新建存档弹窗 -->
    <NewArchiveModal
      :visible="showNewModal"
      @close="showNewModal = false"
      @confirm="createArchive"
    />

    <!-- 导出确认弹窗 -->
    <ConfirmModal
      :visible="exportTargetId !== null"
      title="导出存档"
      :message="`确认导出存档「${exportArchiveTitle}」？`"
      confirm-text="导出"
      @confirm="confirmExport"
      @cancel="exportTargetId = null"
    />

    <!-- 删除确认弹窗 -->
    <ConfirmModal
      :visible="deleteTarget !== null"
      title="删除存档"
      :message="`确认删除存档「${deleteTarget?.title}」？删除后关联的所有消息也将被删除，此操作不可撤销。`"
      confirm-text="删除"
      :danger="true"
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
