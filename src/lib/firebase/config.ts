import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth'
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

// Synthetic domain used for staff logins that don't have a real company
// email (see `erp/provider.tsx` `createUser`/`login`). Firebase Auth's email
// validator rejects a bare TLD-less domain like `@local`, so this needs an
// actual dot in it.
export const SYNTHETIC_EMAIL_DOMAIN = 'users.internal'

// A second, independent Firebase App instance used only to create Firebase
// Auth accounts for other staff members. `createUserWithEmailAndPassword`
// signs the *caller* in as the newly created user on whichever Auth instance
// it runs on — running it here, instead of on the main `auth` export, keeps
// the admin who's creating the account signed in on their own session.
let secondaryAuth: ReturnType<typeof getAuth> | null = null

function getSecondaryAuth() {
  if (!app) return null
  if (!secondaryAuth) {
    const secondaryApp = getApps().find((candidate) => candidate.name === 'UserCreation')
      ?? initializeApp(firebaseConfig, 'UserCreation')
    secondaryAuth = getAuth(secondaryApp)
  }
  return secondaryAuth
}

// Creates a real Firebase Auth account for a new staff member and returns
// its uid, without disturbing the admin's own signed-in session.
export async function createManagedUser(email: string, password: string) {
  const managedAuth = getSecondaryAuth()
  if (!managedAuth) {
    throw new Error('Firebase Authentication is not configured.')
  }

  const credential = await createUserWithEmailAndPassword(managedAuth, email, password)
  const uid = credential.user.uid
  await signOut(managedAuth)
  return uid
}

// Lets an admin trigger a password-reset email for another user without
// needing their current password (there's no Admin SDK/backend here, so we
// can't force-overwrite another account's password directly).
export function sendUserPasswordReset(email: string) {
  if (!auth) {
    throw new Error('Firebase Authentication is not configured.')
  }

  return sendPasswordResetEmail(auth, email)
}
