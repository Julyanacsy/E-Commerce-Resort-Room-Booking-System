// Offline Storage Manager using IndexedDB
// Handles offline data storage and sync

interface OfflineRequest {
  id: string
  type: 'booking' | 'contact' | 'feedback'
  endpoint: string
  method: string
  body: any
  timestamp: number
  retries: number
  maxAge?: number // Maximum age in milliseconds before marking as stale
}

const DB_NAME = 'LuxeStayOfflineDB'
const DB_VERSION = 1
const STORE_NAME = 'offlineRequests'
const MAX_RETRIES = 3
const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours default

class OfflineStorage {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  async init(): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('[OfflineStorage] IndexedDB not available (SSR or unsupported browser)')
      return Promise.resolve()
    }
    
    if (this.db) return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('[OfflineStorage] Failed to open database')
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('[OfflineStorage] Database opened')
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('timestamp', 'timestamp', { unique: false })
          store.createIndex('type', 'type', { unique: false })
        }
      }
    })

    return this.initPromise
  }

  async saveRequest(request: Omit<OfflineRequest, 'id' | 'timestamp' | 'retries'>): Promise<string> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    const id = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const offlineRequest: OfflineRequest = {
      id,
      timestamp: Date.now(),
      retries: 0,
      maxAge: DEFAULT_MAX_AGE,
      ...request,
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.add(offlineRequest)

      request.onsuccess = () => {
        console.log('[OfflineStorage] Request saved:', id)
        resolve(id)
      }

      request.onerror = () => {
        console.error('[OfflineStorage] Failed to save request:', request.error)
        reject(request.error)
      }
    })
  }

  async getAllRequests(): Promise<OfflineRequest[]> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  async getPendingRequests(): Promise<OfflineRequest[]> {
    const all = await this.getAllRequests()
    const now = Date.now()
    
    return all.filter((req) => {
      const age = now - req.timestamp
      const isStale = req.maxAge ? age > req.maxAge : false
      return !isStale && req.retries < MAX_RETRIES
    })
  }

  async getStaleRequests(): Promise<OfflineRequest[]> {
    const all = await this.getAllRequests()
    const now = Date.now()
    
    return all.filter((req) => {
      const age = now - req.timestamp
      return req.maxAge ? age > req.maxAge : false
    })
  }

  async deleteRequest(id: string): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(id)

      request.onsuccess = () => {
        console.log('[OfflineStorage] Request deleted:', id)
        resolve()
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  async incrementRetry(id: string): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const getRequest = store.get(id)

      getRequest.onsuccess = () => {
        const request = getRequest.result
        if (request) {
          request.retries += 1
          const putRequest = store.put(request)
          putRequest.onsuccess = () => resolve()
          putRequest.onerror = () => reject(putRequest.error)
        } else {
          resolve()
        }
      }

      getRequest.onerror = () => reject(getRequest.error)
    })
  }

  async clearStaleRequests(): Promise<number> {
    const stale = await this.getStaleRequests()
    await Promise.all(stale.map((req) => this.deleteRequest(req.id)))
    return stale.length
  }
}

export const offlineStorage = new OfflineStorage()

// Sync Manager
export class SyncManager {
  private isOnline: boolean
  private syncInProgress = false
  private syncInterval: NodeJS.Timeout | null = null

  constructor() {
    // Only initialize on client side
    if (typeof window === 'undefined') {
      this.isOnline = false
      return
    }

    // Check online status
    this.isOnline = window.navigator?.onLine !== false

    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('[SyncManager] Back online, syncing...')
      this.isOnline = true
      this.sync()
    })

    window.addEventListener('offline', () => {
      console.log('[SyncManager] Gone offline')
      this.isOnline = false
    })

    // Initial sync check
    if (this.isOnline) {
      this.sync()
    }

    // Periodic sync check
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.sync()
      }
    }, 30000) // Every 30 seconds
  }

  async sync(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) return

    this.syncInProgress = true
    console.log('[SyncManager] Starting sync...')

    try {
      // Clear stale requests first
      const staleCount = await offlineStorage.clearStaleRequests()
      if (staleCount > 0) {
        console.log(`[SyncManager] Cleared ${staleCount} stale requests`)
      }

      const pending = await offlineStorage.getPendingRequests()
      console.log(`[SyncManager] Found ${pending.length} pending requests`)

      const results = await Promise.allSettled(
        pending.map((req) => this.syncRequest(req))
      )

      const successful = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      console.log(`[SyncManager] Sync complete: ${successful} successful, ${failed} failed`)
    } catch (error) {
      console.error('[SyncManager] Sync error:', error)
    } finally {
      this.syncInProgress = false
    }
  }

  private async syncRequest(request: OfflineRequest): Promise<void> {
    try {
      // Check if request is stale
      const now = Date.now()
      const age = now - request.timestamp
      if (request.maxAge && age > request.maxAge) {
        console.log(`[SyncManager] Request ${request.id} is stale (age: ${age}ms, maxAge: ${request.maxAge}ms), deleting...`)
        await offlineStorage.deleteRequest(request.id)
        throw new Error('Request is too old and cannot be synced')
      }

      const response = await fetch(request.endpoint, {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request.body),
      })

      if (response.ok) {
        await offlineStorage.deleteRequest(request.id)
        console.log(`[SyncManager] Successfully synced request: ${request.id}`)
      } else {
        const errorData = await response.json().catch(() => ({}))
        const error = new Error(errorData.error || `HTTP ${response.status}`)
        
        // If too many retries, delete the request
        if (request.retries >= MAX_RETRIES - 1) {
          console.error(`[SyncManager] Request ${request.id} exceeded max retries, deleting...`)
          await offlineStorage.deleteRequest(request.id)
          throw new Error(`Failed after ${MAX_RETRIES} attempts: ${error.message}`)
        }
        
        throw error
      }
    } catch (error) {
      console.error(`[SyncManager] Failed to sync request ${request.id}:`, error)
      
      // Only increment retry if not stale and not exceeded max retries
      const now = Date.now()
      const age = now - request.timestamp
      if (!request.maxAge || age <= request.maxAge) {
        if (request.retries < MAX_RETRIES - 1) {
          await offlineStorage.incrementRetry(request.id)
        }
      }
      
      throw error
    }
  }

  async submitWithOfflineSupport(
    endpoint: string,
    method: string,
    body: any,
    type: 'booking' | 'contact' | 'feedback',
    maxAge?: number
  ): Promise<{ success: boolean; offlineId?: string; error?: string }> {
    if (this.isOnline) {
      try {
        const response = await fetch(endpoint, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (response.ok) {
          return { success: true }
        } else {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `HTTP ${response.status}`)
        }
      } catch (error) {
        // Network error - save for offline
        console.log('[SyncManager] Network error, saving for offline:', error)
        const offlineId = await offlineStorage.saveRequest({
          endpoint,
          method,
          body,
          type,
          maxAge,
        })
        return { success: false, offlineId }
      }
    } else {
      // Already offline - save immediately
      console.log('[SyncManager] Offline, saving request')
      const offlineId = await offlineStorage.saveRequest({
        endpoint,
        method,
        body,
        type,
        maxAge,
      })
      return { success: false, offlineId }
    }
  }
}

// Create syncManager only on client side to avoid SSR issues
export const syncManager = typeof window !== 'undefined' ? new SyncManager() : {
  submitWithOfflineSupport: async () => ({ success: false, error: 'Client-side only' }),
  sync: async () => {},
} as any

