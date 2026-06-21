import Dexie, { type Table } from 'dexie'
import type { Archive, Message, ApiConfig, SystemConfigItem, CharacterRole } from './schemas'

export class NarrativeForgeDB extends Dexie {
  archives!: Table<Archive, number>
  messages!: Table<Message, number>
  apiConfigs!: Table<ApiConfig, number>
  systemConfigs!: Table<SystemConfigItem, number>
  characterRoles!: Table<CharacterRole, number>

  constructor() {
    super('NarrativeForgeDB')
    this.version(1).stores({
      archives: '++id, createdAt',
      messages: '++id, archiveId, [archiveId+timestamp], [archiveId+summaryStatus]',
      apiConfigs: '++id, name',
      systemConfigs: '++id, key',
    })
    this.version(2).stores({
      archives: '++id, createdAt',
      messages: '++id, archiveId, [archiveId+timestamp], [archiveId+summaryStatus]',
      apiConfigs: '++id, name',
      systemConfigs: '++id, key',
    }).upgrade(async tx => {
      const items = await tx.table('systemConfigs').toArray()
      for (const item of items) {
        await tx.table('systemConfigs').update(item.id, {
          remark: item.remark || item.key,
          sortOrder: item.sortOrder || item.createdAt,
        })
      }
    })
    this.version(3).stores({
      archives: '++id, createdAt',
      messages: '++id, archiveId, [archiveId+timestamp], [archiveId+summaryStatus]',
      apiConfigs: '++id, name',
      systemConfigs: '++id, key',
    }).upgrade(async tx => {
      const items = await tx.table('apiConfigs').toArray()
      for (const item of items) {
        await tx.table('apiConfigs').update(item.id, {
          sortOrder: item.sortOrder !== undefined ? item.sortOrder : item.id,
        })
      }
    })
    this.version(4).stores({
      archives: '++id, createdAt',
      messages: '++id, archiveId, [archiveId+timestamp], [archiveId+summaryStatus]',
      apiConfigs: '++id, name',
      systemConfigs: '++id, key',
      characterRoles: '++id, archiveId, sortOrder',
    }).upgrade(async tx => {
      const archives = await tx.table('archives').toArray()
      for (const a of archives) {
        if (a.referencedSystemRoleIds === undefined) {
          await tx.table('archives').update(a.id, { referencedSystemRoleIds: [] })
        }
      }
    })
  }
}

export const db = new NarrativeForgeDB()
