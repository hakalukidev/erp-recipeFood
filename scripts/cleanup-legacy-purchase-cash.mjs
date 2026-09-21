// One-off cleanup for the 2026-09-22 change that decoupled Purchase from
// Cash Maintenance. Purchases and vendor payments saved before that date
// auto-posted CashMaintenanceRecord(s), linked via `cashMaintenanceIds`.
// Those entries still count in Cash Out, so they double up with the
// direct Cash Maintenance entries the client now makes by hand.
//
// Dry-run by default (read-only). Pass --delete to remove the linked
// Cash Maintenance entries and clear `cashMaintenanceIds` on the purchase /
// vendor payment (the purchase, its due and its stock are left untouched).
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
//   NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://<project>-default-rtdb.firebaseio.com \
//   node scripts/cleanup-legacy-purchase-cash.mjs [--delete]

import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
if (!databaseURL) throw new Error('Set NEXT_PUBLIC_FIREBASE_DATABASE_URL.')

initializeApp({ credential: applicationDefault(), databaseURL })
const root = getDatabase().ref('erp')
const doDelete = process.argv.includes('--delete')

const [purchases, payments, cash] = await Promise.all(
  ['purchases', 'vendorPayments', 'cashMaintenance'].map(async (key) => (await root.child(key).get()).val() ?? {})
)

const updates = {}
const rows = []

function collect(kind, parents) {
  for (const [id, parent] of Object.entries(parents)) {
    for (const entryId of parent.cashMaintenanceIds ?? []) {
      const entry = cash[entryId]
      if (!entry) continue // already gone
      rows.push({
        source: `${kind} ${parent.purchaseNumber ?? id}`,
        date: entry.date,
        category: entry.category,
        amount: entry.amount,
        entryId,
      })
      updates[`cashMaintenance/${entryId}`] = null
    }
    if (parent.cashMaintenanceIds?.length) {
      updates[`${kind === 'purchase' ? 'purchases' : 'vendorPayments'}/${id}/cashMaintenanceIds`] = null
    }
  }
}

collect('purchase', purchases)
collect('vendorPayment', payments)

console.table(rows)
console.log(`${rows.length} legacy auto-posted cash entries, total ${rows.reduce((s, r) => s + Number(r.amount || 0), 0)}`)

if (!doDelete) {
  console.log('Dry run — nothing changed. Re-run with --delete to remove them.')
} else if (rows.length) {
  await root.update(updates)
  console.log('Deleted.')
}
process.exit(0)
