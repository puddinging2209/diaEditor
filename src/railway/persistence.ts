import { validateVirtualRailwayShape } from './io.ts'
import type { VirtualRailwayData } from './types.ts'

interface StoredRailwayData {
  key: 'current'
  data: unknown
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
}

export class IndexedDbRailwayStore {
  private readonly database: Promise<IDBDatabase>

  constructor(
    databaseName = 'virtual-railway',
    indexedDb: IDBFactory | undefined = globalThis.indexedDB,
  ) {
    if (!indexedDb) {
      throw new Error('IndexedDB is unavailable in this environment.')
    }

    this.database = new Promise((resolve, reject) => {
      const request = indexedDb.open(databaseName, 1)
      let blocked = false
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('railway-data')) {
          database.createObjectStore('railway-data', { keyPath: 'key' })
        }
      }
      request.onsuccess = () => {
        if (blocked) {
          request.result.close()
        } else {
          resolve(request.result)
        }
      }
      request.onerror = () => reject(request.error ?? new Error('Unable to open the railway database.'))
      request.onblocked = () => {
        blocked = true
        reject(new Error('Opening the railway database was blocked by another connection.'))
      }
    })
  }

  async load(): Promise<VirtualRailwayData | null> {
    const database = await this.database
    const transaction = database.transaction('railway-data', 'readonly')
    const completed = transactionComplete(transaction)
    const request = transaction.objectStore('railway-data').get('current') as IDBRequest<StoredRailwayData | undefined>
    const [stored] = await Promise.all([requestResult(request), completed])
    if (!stored) return null

    const issues = validateVirtualRailwayShape(stored.data)
    if (issues.length) {
      throw new Error(`Stored railway data is invalid: ${issues.map((item) => item.message).join(' ')}`)
    }
    return stored.data as VirtualRailwayData
  }

  async save(data: VirtualRailwayData): Promise<void> {
    const issues = validateVirtualRailwayShape(data)
    if (issues.length) {
      throw new Error(`Railway data is invalid: ${issues.map((item) => item.message).join(' ')}`)
    }

    const database = await this.database
    const transaction = database.transaction('railway-data', 'readwrite')
    const completed = transactionComplete(transaction)
    const request = transaction.objectStore('railway-data').put({ key: 'current', data } satisfies StoredRailwayData)
    await Promise.all([requestResult(request), completed])
  }

  async clear(): Promise<void> {
    const database = await this.database
    const transaction = database.transaction('railway-data', 'readwrite')
    const completed = transactionComplete(transaction)
    const request = transaction.objectStore('railway-data').delete('current')
    await Promise.all([requestResult(request), completed])
  }

  async close(): Promise<void> {
    (await this.database).close()
  }
}
