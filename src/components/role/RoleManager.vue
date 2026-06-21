<script setup lang="ts">
import type { CharacterRole } from '@/types'
import RoleCard from './RoleCard.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { Plus } from 'lucide-vue-next'
import { ref } from 'vue'

const props = defineProps<{
  roles: CharacterRole[]
  variant: 'system' | 'archive'
  emptyText: string
  draggable?: boolean
}>()

const emit = defineEmits<{
  add: []
  click: [role: CharacterRole]
  delete: [role: CharacterRole]
  reorder: [payload: { fromIndex: number; toIndex: number }]
}>()

const deleteTarget = ref<CharacterRole | null>(null)

const dragIdx = ref<number | null>(null)
const dragOverIdx = ref<number | null>(null)

function onDragStart(e: DragEvent, idx: number) {
  dragIdx.value = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
}
function onDragOver(e: DragEvent, idx: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverIdx.value = idx
}
function onDrop(e: DragEvent, targetIdx: number) {
  e.preventDefault()
  if (dragIdx.value === null || dragIdx.value === targetIdx) {
    dragIdx.value = null
    dragOverIdx.value = null
    return
  }
  emit('reorder', { fromIndex: dragIdx.value, toIndex: targetIdx })
  dragIdx.value = null
  dragOverIdx.value = null
}
function onDragEnd() {
  dragIdx.value = null
  dragOverIdx.value = null
}
</script>

<template>
  <div class="role-manager">
    <div class="role-grid">
      <template v-for="(role, idx) in roles" :key="role.id">
        <div
          v-if="draggable"
          draggable="true"
          :class="[
            dragIdx === idx ? 'opacity-40' : '',
            dragOverIdx === idx && dragIdx !== idx ? 'ring-2 ring-[var(--color-accent)] rounded-xl' : ''
          ]"
          @dragstart="onDragStart($event, idx)"
          @dragover="onDragOver($event, idx)"
          @drop="onDrop($event, idx)"
          @dragend="onDragEnd"
        >
          <RoleCard :role="role" :variant="variant" @click="emit('click', $event)" @contextmenu.prevent="deleteTarget = role" />
        </div>
        <RoleCard
          v-else
          :role="role"
          :variant="variant"
          @click="emit('click', $event)"
          @contextmenu.prevent="deleteTarget = role"
        />
      </template>
      <button class="role-card-add" @click="emit('add')">
        <div class="role-card-add-inner">
          <Plus :size="32" class="text-[var(--color-text-muted)]" />
          <span class="text-[var(--color-text-muted)] text-sm">添加角色</span>
        </div>
      </button>
    </div>
    <div v-if="roles.length === 0" class="text-center py-12 text-sm text-[var(--color-text-muted)] empty-state rounded-lg">
      {{ emptyText }}
    </div>

    <ConfirmModal
      :visible="deleteTarget !== null"
      title="删除角色"
      :message="`确认删除角色「${deleteTarget?.name || ''}」？此操作不可撤销。`"
      confirm-text="删除"
      :danger="true"
      @confirm="deleteTarget && emit('delete', deleteTarget); deleteTarget = null"
      @cancel="deleteTarget = null"
    />
  </div>
</template>

<style scoped>
.role-manager {
  width: 100%;
}

.role-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.role-card-add {
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.25s ease;
  border: 2px dashed var(--color-border);
  background: transparent;
  padding: 0;
  appearance: none;
}

.role-card-add:hover {
  border-color: var(--color-accent);
  background: rgba(123, 75, 58, 0.04);
}

.role-card-add-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 10px;
}

@media (max-width: 640px) {
  .role-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
}
</style>
