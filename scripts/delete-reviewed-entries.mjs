// One-off: delete every entry that has been through Input & Authorization
// (approved or rejected) — the rows the /admin/approvals page counts — with
// the same cascade the app's own Delete buttons use (provider.tsx
// deleteRateCard / deletePurchase / deleteVendorPayment / deleteProductReturn
// / deleteMaterialUsage / deleteProductionBatch / deleteLoanTransaction /
// deleteCashMaintenance / deleteInvestor / deleteExpense), so stock, invoice
// and purchase dues, stock shortfalls and the ledger stay consistent.
// Ledger rows are never deleted — they get reversal entries, like the app.
// Pending entries are left alone.
//
// Dry-run by default (read-only, prints the plan). Pass --apply to write.
// A full copy of /erp is saved to ~/erp-recipeFood-backups first.
//
//   node scripts/delete-reviewed-entries.mjs --login [--apply]
//   (ERP_ADMIN_PASSWORD=... skips the password prompt)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const apply = process.argv.includes('--apply')
const useLogin = process.argv.includes('--login')

try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
if (!databaseURL) throw new Error('Set NEXT_PUBLIC_FIREBASE_DATABASE_URL.')

let readPath, writeUpdates
if (useLogin) {
  const { initializeApp } = await import('firebase/app')
  const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth')
  const { getDatabase, ref, get, update } = await import('firebase/database')
  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    databaseURL,
  })
  const email = arg('email') ?? ((await prompt('Admin email [admin@recipe.com]: ')) || 'admin@recipe.com')
  const password = process.env.ERP_ADMIN_PASSWORD ?? (await prompt('Password: ', true))
  const cred = await signInWithEmailAndPassword(getAuth(app), email, password)
  console.log(`Signed in as ${cred.user.email}`)
  const db = getDatabase(app)
  readPath = async (p) => (await get(ref(db, `erp/${p}`))).val()
  writeUpdates = (obj) => update(ref(db, 'erp'), obj)
} else {
  const { applicationDefault, initializeApp } = await import('firebase-admin/app')
  const { getDatabase } = await import('firebase-admin/database')
  initializeApp({ credential: applicationDefault(), databaseURL })
  const root = getDatabase().ref('erp')
  readPath = async (p) => (await root.child(p).get()).val()
  writeUpdates = (obj) => root.update(obj)
}

function prompt(question, hidden = false) {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const stdin = process.stdin
    let buf = ''
    if (hidden && stdin.isTTY) stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.off('data', onData)
          if (hidden && stdin.isTTY) stdin.setRawMode(false)
          stdin.pause()
          process.stdout.write('\n')
          return resolve(buf.trim())
        }
        if (c === '\u0003') process.exit(1)
        if (c === '\u007f') { buf = buf.slice(0, -1); continue }
        buf += c
      }
    }
    stdin.on('data', onData)
  })
}

// ---- Load + back up ---------------------------------------------------------

const TOUCHED = [
  'rateCards', 'collections', 'productReturns', 'purchases', 'vendorPayments', 'materialUsages',
  'productionBatches', 'cashMaintenance', 'loanTransactions', 'investors', 'journalEntries', 'expenses',
  'ledgerEntries', 'products', 'finishedGoods', 'purchaseMaterials', 'stockShortfalls',
]
const data = {}
for (const key of TOUCHED) data[key] = (await readPath(key)) ?? {}

const backupDir = `${homedir()}/erp-recipeFood-backups`
mkdirSync(backupDir, { recursive: true })
const backupFile = `${backupDir}/before-delete-reviewed-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
writeFileSync(backupFile, JSON.stringify(data, null, 2))
console.log(`Backup: ${backupFile}`)

// ---- Helpers (ported from provider.tsx / utils.ts) -------------------------

const isCounted = (entry) => entry?.approvalStatus !== 'rejected'
let idSeq = 0
const createId = (prefix) => `${prefix}_${Date.now()}_${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
const now = new Date().toISOString()
const round2 = (n) => Math.round(n * 100) / 100

const toLatinDigits = (v) => (v == null ? v : String(v).replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))))
function parsePerCtnMultiplier(perCtnBgs) {
  const match = toLatinDigits(perCtnBgs)?.match(/[\d.,]+/)
  if (!match) return 1
  const value = Number(match[0].replace(/,/g, ''))
  return Number.isFinite(value) && value > 0 ? value : 1
}
function rateCardLineStockUnits(item) {
  const pieces = item.qty * parsePerCtnMultiplier(item.perCtnBgs)
  return item.finishedGoodsId && item.piecesPerStockUnit > 0 ? pieces / item.piecesPerStockUnit : pieces
}
function productStatus(stockQty, minStock) {
  if (stockQty <= 0) return 'out-of-stock'
  if (stockQty <= minStock) return 'low-stock'
  return 'active'
}

// All writes go through set()/del(): they land in `updates` AND in the local
// copy, so later deletions in this run see earlier ones (e.g. an invoice
// deleted after its product return already gave its due back).
const updates = {}
const log = []
function set(path, value) {
  updates[path] = value
  const parts = path.split('/')
  let node = data
  for (const p of parts.slice(0, -1)) node = node[p] ??= {}
  if (value === null) delete node[parts.at(-1)]
  else node[parts.at(-1)] = value
}
function del(collection, id, why) {
  if (!data[collection]?.[id]) return
  set(`${collection}/${id}`, null)
  log.push(`  delete ${collection}/${id}${why ? `  (${why})` : ''}`)
}
function reverseLedger(orderId) {
  const forOrder = Object.values(data.ledgerEntries).filter((e) => e.orderId === orderId)
  const reversed = new Set(forOrder.filter((e) => e.reversalOf).map((e) => e.reversalOf))
  forOrder
    .filter((e) => !e.reversalOf && !reversed.has(e.id))
    .forEach((entry) => {
      const id = createId('ledger')
      set(`ledgerEntries/${id}`, {
        id, date: now, orderId: entry.orderId, billNumber: entry.billNumber, account: entry.account,
        accountRef: entry.accountRef ?? '', description: `Reversal: ${entry.description}`,
        debit: entry.credit, credit: entry.debit, reversalOf: entry.id, createdAt: now,
      })
      log.push(`  reverse ledger ${entry.id} (${entry.account} dr ${entry.debit} cr ${entry.credit})`)
    })
}
function moveStock(collection, id, delta) {
  const rec = data[collection][id]
  if (!rec || !delta) return
  const next = rec.stockQty + delta
  set(`${collection}/${id}/stockQty`, next)
  set(`${collection}/${id}/updatedAt`, now)
  if (collection === 'products') set(`products/${id}/status`, productStatus(next, rec.minStock ?? 0))
  log.push(`  stock ${collection}/${id} (${rec.name ?? ''}) ${rec.stockQty - delta} → ${next}`)
}

// ---- Per-collection deletes (mirror provider.tsx) ---------------------------

const deleters = {
  productReturns(r) {
    del('productReturns', r.id)
    const card = r.rateCardId && data.rateCards[r.rateCardId]
    if (card && r.dueAdjustment && isCounted(r)) {
      set(`rateCards/${card.id}/due`, round2(card.due + r.dueAdjustment))
      set(`rateCards/${card.id}/returnAdjustment`, round2((card.returnAdjustment ?? 0) - r.dueAdjustment))
      set(`rateCards/${card.id}/updatedAt`, now)
      log.push(`  invoice ${card.invoiceNo}: due back +${r.dueAdjustment}`)
    }
    ;[r.manufacturingExpenseId, r.rawMaterialExpenseId].forEach((expenseId) => {
      if (!expenseId || !data.expenses[expenseId]) return
      del('expenses', expenseId, 'return write-off expense')
      reverseLedger(expenseId)
    })
  },
  collections(c) {
    del('collections', c.id)
    const card = data.rateCards[c.rateCardId]
    if (card && isCounted(c)) {
      set(`rateCards/${card.id}/paid`, round2(card.paid - c.amount))
      set(`rateCards/${card.id}/due`, round2(card.due + c.amount))
      log.push(`  invoice ${card.invoiceNo}: paid −${c.amount}, due +${c.amount}`)
    }
    reverseLedger(c.id)
  },
  vendorPayments(p) {
    del('vendorPayments', p.id)
    const purchase = p.purchaseId && data.purchases[p.purchaseId]
    if (purchase && isCounted(p)) {
      set(`purchases/${purchase.id}/paid`, round2(purchase.paid - p.amount))
      set(`purchases/${purchase.id}/due`, round2(purchase.due + p.amount))
      log.push(`  purchase ${purchase.purchaseNumber}: paid −${p.amount}, due +${p.amount}`)
    }
    p.cashMaintenanceIds?.forEach((id) => del('cashMaintenance', id, 'linked cash entry'))
  },
  cashMaintenance(r) {
    del('cashMaintenance', r.id)
  },
  loanTransactions(t) {
    del('loanTransactions', t.id)
    if (t.cashMaintenanceId) del('cashMaintenance', t.cashMaintenanceId, 'linked cash entry')
    if (t.expenseId) {
      reverseLedger(t.expenseId)
      del('expenses', t.expenseId, 'linked expense')
    }
  },
  investors(i) {
    del('investors', i.id)
    if (i.cashMaintenanceId) del('cashMaintenance', i.cashMaintenanceId, 'linked cash entry')
  },
  expenses(e) {
    del('expenses', e.id)
    reverseLedger(e.id)
    if (e.loanTransactionId) del('loanTransactions', e.loanTransactionId, 'linked loan transaction')
  },
  journalEntries(j) {
    reverseLedger(j.id)
    del('journalEntries', j.id)
  },
  materialUsages(u) {
    del('materialUsages', u.id)
    moveStock('purchaseMaterials', u.materialId, u.qty)
  },
  productionBatches(b) {
    del('productionBatches', b.id)
    Object.values(data.stockShortfalls).forEach((s) => {
      const resolutions = s.resolutions ?? []
      const matches = resolutions.filter((x) => x.productionBatchId === b.id)
      if (!matches.length) return
      const remaining = s.remainingQty + matches.reduce((sum, x) => sum + x.qty, 0)
      set(`stockShortfalls/${s.id}/remainingQty`, remaining)
      set(`stockShortfalls/${s.id}/status`, remaining > 0 ? 'open' : 'resolved')
      set(`stockShortfalls/${s.id}/resolutions`, resolutions.filter((x) => x.productionBatchId !== b.id))
      set(`stockShortfalls/${s.id}/updatedAt`, now)
      log.push(`  shortfall ${s.id}: un-covered by this batch`)
    })
    moveStock('purchaseMaterials', b.rawMaterialId, b.rawKgConsumedTotal)
    if (b.materialUsageId) del('materialUsages', b.materialUsageId, 'batch material usage')
    ;(b.outputs ?? []).forEach((o) => moveStock('finishedGoods', o.finishedGoodsId, -o.qtyProduced))
  },
  rateCards(card) {
    const linkedReturn = Object.values(data.productReturns).find(
      (r) => r.rateCardId === card.id && r.dueAdjustment && isCounted(r)
    )
    if (linkedReturn) throw new Error(`Invoice ${card.invoiceNo} still has return ${linkedReturn.returnNumber} credited against it.`)
    del('rateCards', card.id)
    Object.values(data.collections)
      .filter((c) => c.rateCardId === card.id)
      .forEach((c) => {
        del('collections', c.id, `collection on ${card.invoiceNo}`)
        reverseLedger(c.id)
      })
    reverseLedger(card.id)
    const pieces = new Map()
    ;(card.items ?? []).forEach((item) => {
      const key = item.finishedGoodsId ? `finishedGoods:${item.finishedGoodsId}` : item.productId ? `products:${item.productId}` : null
      if (key) pieces.set(key, (pieces.get(key) ?? 0) + rateCardLineStockUnits(item))
    })
    pieces.forEach((qty, key) => {
      const [collection, id] = key.split(':')
      const rec = data[collection][id]
      if (!rec) return
      if (collection === 'finishedGoods') {
        const before = rec.stockQty
        const shortfallDelta = Math.max(0, -(before + qty)) - Math.max(0, -before)
        const existing = Object.values(data.stockShortfalls).find((s) => s.rateCardId === card.id && s.finishedGoodsId === id)
        if (shortfallDelta < 0 && existing) {
          const reduceBy = Math.min(-shortfallDelta, existing.remainingQty)
          const nextRemaining = existing.remainingQty - reduceBy
          if (nextRemaining <= 0 && !(existing.resolutions ?? []).length) {
            del('stockShortfalls', existing.id, `shortfall of ${card.invoiceNo}`)
          } else {
            set(`stockShortfalls/${existing.id}/shortfallQty`, Math.max(0, existing.shortfallQty - reduceBy))
            set(`stockShortfalls/${existing.id}/remainingQty`, nextRemaining)
            set(`stockShortfalls/${existing.id}/status`, nextRemaining <= 0 ? 'resolved' : 'open')
            set(`stockShortfalls/${existing.id}/updatedAt`, now)
          }
        }
      }
      moveStock(collection, id, qty)
    })
  },
  purchases(p) {
    del('purchases', p.id)
    const deltas = new Map()
    ;(p.items ?? []).forEach((item) => {
      if (item.materialId) deltas.set(item.materialId, (deltas.get(item.materialId) ?? 0) + item.qty)
    })
    deltas.forEach((qty, id) => moveStock('purchaseMaterials', id, -qty))
    p.cashMaintenanceIds?.forEach((id) => del('cashMaintenance', id, 'legacy purchase cash entry'))
    Object.values(data.vendorPayments)
      .filter((v) => v.purchaseId === p.id)
      .forEach((v) => {
        del('vendorPayments', v.id, `payment on ${p.purchaseNumber}`)
        v.cashMaintenanceIds?.forEach((id) => del('cashMaintenance', id, 'linked cash entry'))
      })
  },
}

// ---- Pick targets -----------------------------------------------------------

// Order matters: children/credits first so their parents' dues are right,
// batches before invoices so shortfalls are un-covered before invoices drop them.
const ORDER = [
  'productReturns', 'collections', 'vendorPayments', 'cashMaintenance', 'loanTransactions', 'investors',
  'expenses', 'journalEntries', 'materialUsages', 'productionBatches', 'rateCards', 'purchases',
]
const isReviewed = (collection, r) =>
  collection === 'expenses'
    ? r.approvedAt && r.approvalStatus !== 'pending' // what the Approvals page lists for expenses
    : r.approvalStatus === 'approved' || r.approvalStatus === 'rejected'

const targets = ORDER.flatMap((collection) =>
  Object.values(data[collection])
    .filter((r) => r && isReviewed(collection, r))
    .map((r) => ({ collection, id: r.id, status: r.approvalStatus }))
)

const describe = (c, r) =>
  [r.invoiceNo, r.receiptNumber, r.returnNumber, r.purchaseNumber, r.batchNumber, r.journalNumber, r.category,
    r.recipientName, r.vendorName, r.memberName, r.materialName, r.name, r.date ?? r.collectionDate,
    r.amount ?? r.dealerRateTotal ?? r.total]
    .filter((v) => v !== undefined && v !== '')
    .join(' · ')

console.log(`\n${targets.length} approved/rejected entries:`)
for (const t of targets) {
  const r = data[t.collection][t.id]
  if (!r) {
    console.log(`\n[${t.status}] ${t.collection}/${t.id} — already removed by an earlier cascade`)
    continue
  }
  console.log(`\n[${t.status}] ${t.collection}/${t.id} — ${describe(t.collection, r)}`)
  const start = log.length
  deleters[t.collection](r)
  console.log(log.slice(start).join('\n'))
}

console.log(`\n${Object.keys(updates).length} database paths would change.`)
if (!apply) {
  console.log('Dry run — nothing written. Re-run with --apply to delete.')
  process.exit(0)
}
await writeUpdates(updates)
console.log('Done — written to live DB.')
process.exit(0)
