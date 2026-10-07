// One-off (2026-10-08): dealer returns linked to an invoice used to credit
// the invoice due at the Depot rate (depotRateTotal) instead of the Dealer
// rate (dealerRateTotal) the return invoice prints — e.g. PRTN-74163771
// credited 20,222.30 off M-001/10 instead of 21,132.30. For every counted
// dealer return whose dueAdjustment is exactly that old default, raise it to
// dealerRateTotal (capped at the invoice's open due), moving the invoice's
// due/returnAdjustment by the difference — same netting as the app's
// applyReturnDueAdjustment. Hand-typed amounts are left alone.
//
// Dry-run by default. Pass --apply to write. /erp/rateCards and
// /erp/productReturns are saved to ~/erp-recipeFood-backups first.
//
//   ERP_ADMIN_PASSWORD=... node scripts/fix-dealer-return-credit.mjs [--apply]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'

const apply = process.argv.includes('--apply')

try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const { initializeApp } = await import('firebase/app')
const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth')
const { getDatabase, ref, get, update } = await import('firebase/database')
const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
})
const email = process.env.ERP_ADMIN_EMAIL ?? 'admin@recipe.com'
const password = process.env.ERP_ADMIN_PASSWORD
if (!password) throw new Error('Set ERP_ADMIN_PASSWORD.')
const cred = await signInWithEmailAndPassword(getAuth(app), email, password)
console.log(`Signed in as ${cred.user.email}`)
const db = getDatabase(app)

const rateCards = (await get(ref(db, 'erp/rateCards'))).val() ?? {}
const productReturns = (await get(ref(db, 'erp/productReturns'))).val() ?? {}

const round = (value) => Math.round(value * 100) / 100
const updates = {}
const cardState = new Map()
const now = new Date().toISOString()

for (const entry of Object.values(productReturns)) {
  if (entry.returnParty !== 'dealer' || !entry.rateCardId || !entry.dueAdjustment) continue
  if (entry.approvalStatus === 'rejected') continue
  if (Math.abs(entry.dueAdjustment - (entry.depotRateTotal ?? 0)) > 0.005) continue
  const card = rateCards[entry.rateCardId]
  if (!card) continue
  const state = cardState.get(card.id) ?? { due: card.due ?? 0, returnAdjustment: card.returnAdjustment ?? 0, invoiceNo: card.invoiceNo }
  const target = round(Math.min(entry.dealerRateTotal ?? 0, state.due + entry.dueAdjustment))
  const delta = round(target - entry.dueAdjustment)
  if (delta <= 0.005) continue
  state.due = round(state.due - delta)
  state.returnAdjustment = round(state.returnAdjustment + delta)
  cardState.set(card.id, state)
  updates[`productReturns/${entry.id}/dueAdjustment`] = target
  console.log(
    `${entry.returnNo ?? entry.id} → ${card.invoiceNo}: credit ${entry.dueAdjustment.toFixed(2)} → ${target.toFixed(2)} (+${delta.toFixed(2)}); ` +
      `invoice due ${(card.due ?? 0).toFixed(2)} → ${state.due.toFixed(2)}`
  )
}
cardState.forEach((state, id) => {
  updates[`rateCards/${id}/due`] = state.due
  updates[`rateCards/${id}/returnAdjustment`] = state.returnAdjustment
  updates[`rateCards/${id}/updatedAt`] = now
})

if (!Object.keys(updates).length) {
  console.log('Nothing to fix.')
  process.exit(0)
}
if (!apply) {
  console.log('\nDry run — pass --apply to write.')
  process.exit(0)
}

const dir = `${homedir()}/erp-recipeFood-backups`
mkdirSync(dir, { recursive: true })
const file = `${dir}/before-dealer-return-credit-${now.replace(/[:.]/g, '-')}.json`
writeFileSync(file, JSON.stringify({ rateCards, productReturns }, null, 2))
console.log(`Backup: ${file}`)
await update(ref(db, 'erp'), updates)
console.log('Applied.')
process.exit(0)
