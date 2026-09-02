'use client'

// Firebase Realtime Database's web SDK has no disk persistence of its own
// (that's a Firestore-only feature) — it only keeps a live listener's data
// in memory for as long as the tab stays open. Every page reload is
// otherwise a blank screen until every one of the ~40 top-level `erp/*`
// listeners (see ERP_TOP_LEVEL_KEYS in provider.tsx) round-trips over the
// network again, which is slow/unusable on a field sales officer's patchy
// mobile connection and gives zero offline read access.
//
// This is a small IndexedDB-backed snapshot cache that fixes both: the
// provider hydrates `data` from here instantly on load (stale-but-usable),
// then live Firebase listeners take over and refresh both the UI and this
// cache as soon as they connect. Caching is a nice-to-have, never a hard
// dependency — every function here resolves to a safe fallback (null /
// no-op) instead of throwing if IndexedDB is unavailable (private browsing,
// old browsers, SSR) or a read/write fails for any reason.

const DB_NAME = 'erp-offline-cache'
const DB_VERSION = 1
const STORE_NAME = 'snapshots'
const SNAPSHOT_KEY = 'erp-data'

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** Returns the last snapshot written by `writeCachedERPData`, or null. */
export async function readCachedERPData<T>(): Promise<T | null> {
  const db = await openCacheDb()
  if (!db) return null

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY)
      request.onsuccess = () => resolve((request.result as T) ?? null)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** Overwrites the cached snapshot. Fire-and-forget — never throws. */
export async function writeCachedERPData(value: unknown): Promise<void> {
  const db = await openCacheDb()
  if (!db) return

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(value, SNAPSHOT_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** Wipes the cache — call on logout so a shared device doesn't keep the
 * previous user's ERP data readable offline after they sign out. */
export async function clearCachedERPData(): Promise<void> {
  const db = await openCacheDb()
  if (!db) return

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(SNAPSHOT_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
