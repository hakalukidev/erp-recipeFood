import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getDatabase } from 'firebase/database'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
}

const isBrowser = typeof window !== 'undefined'
const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

if (isBrowser && !isConfigured) {
  console.warn(
    '[firebase] Missing NEXT_PUBLIC_FIREBASE_* env vars — Firebase auth/database/storage are disabled. See .env.local.example.'
  )
}

const app = isBrowser && isConfigured ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null

// `getAuth`/`getDatabase`/`getStorage` throw synchronously when the config is
// invalid (e.g. missing apiKey), which would otherwise crash the entire app
// at module-load time. Guard each one so a missing/incomplete Firebase config
// degrades to `null` instead of taking the whole page down.
export const auth = app ? getAuth(app) : null
export const database = app ? getDatabase(app) : null
export const storage = app ? getStorage(app) : null

// The app's own login screen checks credentials against records already
// stored in the Realtime Database (see erp/provider.tsx `login`) rather than
// using Firebase Auth directly. We still sign in anonymously behind the
// scenes so Realtime Database security rules can require `auth != null` —
// that blocks anyone hitting the database URL directly while leaving the
// app's own login flow completely untouched.
export function ensureFirebaseAuth() {
  if (!auth) return Promise.resolve(null)
  if (auth.currentUser) return Promise.resolve(auth.currentUser)
  return signInAnonymously(auth).then((credential) => credential.user)
}
