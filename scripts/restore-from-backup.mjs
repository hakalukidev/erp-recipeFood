// One-off restore of the transactional data deleted on 2026-10-02, from the
// browser-cache backup (recipefood-old-data-backup-2026-10-02.json).
//
// Never creates duplicates:
//   1. a record whose id already exists on live is skipped;
//   2. a record whose *content* matches a live record is skipped (e.g. the
//      client already re-entered that invoice / collection / expense);
//   3. legacy + test rows are never restored (INV-05995101 order, its
//      collection + ledger rows, anything TEST-DELETE-ME, 2030-dated rows).
// Ledger rows are restored only when their parent record is restored, and
// loan transactions only when their loan member exists.
//
// Dry-run by default (read-only). Pass --apply to write.
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
//   NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://<project>-default-rtdb.firebaseio.com \
//   node scripts/restore-from-backup.mjs [--apply] [--only=rateCards,collections] [--backup=path]
//
// Or without a service account, signing in as an ERP admin (password is typed, not stored):
//   node scripts/restore-from-backup.mjs --login [--apply]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const apply = process.argv.includes('--apply')
const backupPath = arg('backup') ?? `${homedir()}/erp-recipeFood-deleted-data-recovery/recipefood-old-data-backup-2026-10-02.json`

// --login: sign in as an ERP admin user via the client SDK (writes go through
// the database rules). Otherwise use firebase-admin with a service account.
const useLogin = process.argv.includes('--login')

// Pick up NEXT_PUBLIC_FIREBASE_* from .env.local when not already exported.
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

const backup = JSON.parse(readFileSync(backupPath, 'utf8'))

const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
const day = (v) => String(v ?? '').slice(0, 10)
const amt = (v) => Number(v || 0).toFixed(2)

// Content key per collection: two records with the same key are the same entry.
// Notes are ignored on purpose — the client re-types notes differently when
// re-entering. Each live record cancels at most ONE backup record, so two real
// identical backup entries (e.g. two 200-taka auto fares that day) both survive
// unless the client re-entered both.
const CONTENT_KEY = {
  rateCards: (r) => norm(r.invoiceNo),
  collections: (r) => `${norm(r.invoiceNo)}|${day(r.collectionDate)}|${amt(r.amount)}`,
  productReturns: (r) => `${day(r.date)}|${r.dealerId ?? ''}|${norm(r.returnParty)}`,
  expenses: (r) => `${day(r.date)}|${norm(r.category)}|${amt(r.amount)}`,
  cashMaintenance: (r) => `${day(r.date)}|${norm(r.category)}|${amt(r.amount)}|${norm(r.direction || 'out')}`,
  loanTransactions: (r) => `${r.loanAccountId}|${day(r.date)}|${amt(r.amount)}|${r.type}`,
}
const COLLECTIONS = Object.keys(CONTENT_KEY)
const only = arg('only')?.split(',') ?? COLLECTIONS

const LEGACY_ORDER = 'order_1788405995101_1d9o9x'
const isJunk = (r) =>
  JSON.stringify(r).includes('TEST-DELETE-ME') ||
  [r.date, r.collectionDate].some((d) => String(d ?? '').startsWith('2030')) ||
  r.orderId === LEGACY_ORDER

const live = {}
for (const key of [...COLLECTIONS, 'ledgerEntries', 'loanAccounts', 'dealers']) {
  live[key] = (await readPath(key)) ?? {}
}

// Safety copy of the live state of every collection this run touches.
const backupDir = `${homedir()}/erp-recipeFood-deleted-data-recovery`
mkdirSync(backupDir, { recursive: true })
const liveCopy = `${backupDir}/live-before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
writeFileSync(liveCopy, JSON.stringify(live, null, 2))

const updates = {}
const orphanCashIds = new Set(
  Object.values(backup.loanTransactions ?? {})
    .filter((t) => t.cashMaintenanceId && !live.loanAccounts[t.loanAccountId])
    .map((t) => t.cashMaintenanceId)
)
const restored = {} // collection -> Set(id)
const summary = []
const warnings = []
const matches = []
const invoiceRemap = {} // backup rateCard id -> live rateCard id (same invoiceNo)
const invoicePaydown = {} // live rateCard id -> collection total being attached

for (const key of COLLECTIONS) {
  if (!only.includes(key)) continue
  const src = backup[key] ?? {}
  const liveKeys = new Map()
  for (const r of Object.values(live[key])) {
    const k = CONTENT_KEY[key](r)
    liveKeys.set(k, [...(liveKeys.get(k) ?? []), r])
  }
  const seen = new Map()
  const row = { collection: key, inBackup: 0, alreadyLiveId: 0, alreadyLiveContent: 0, junk: 0, orphan: 0, toRestore: 0, amount: 0 }
  restored[key] = new Set()
  for (let [id, rec] of Object.entries(src)) {
    row.inBackup++
    if (isJunk(rec)) { row.junk++; continue }
    if (live[key][id]) { row.alreadyLiveId++; continue }
    const ck = CONTENT_KEY[key](rec)
    if (liveKeys.get(ck)?.length) {
      const match = liveKeys.get(ck).shift()
      if (key === 'rateCards') invoiceRemap[id] = match.id
      matches.push(`${key}: backup ${id} = live ${match.id} (${ck})`)
      row.alreadyLiveContent++
      continue
    }
    if (key === 'loanTransactions' && !live.loanAccounts[rec.loanAccountId]) { row.orphan++; continue }
    // Cash entries auto-created by a loan repayment follow their loan member.
    if (key === 'cashMaintenance' && orphanCashIds.has(id)) { row.orphan++; continue }
    if ((key === 'rateCards' || key === 'collections' || key === 'productReturns') && rec.dealerId && !live.dealers[rec.dealerId]) { row.orphan++; continue }
    if (seen.has(ck)) warnings.push(`${key}: ${id} has the same content as ${seen.get(ck)} inside the backup (both kept — check manually)`)
    seen.set(ck, id)
    // A collection whose invoice was already re-entered on live is attached
    // to the live invoice, whose paid/due then moves the same way the app's
    // recordCollection does.
    if (key === 'collections' && invoiceRemap[rec.rateCardId]) {
      const liveId = invoiceRemap[rec.rateCardId]
      rec = { ...rec, rateCardId: liveId }
      if (rec.approvalStatus !== 'rejected') {
        invoicePaydown[liveId] = (invoicePaydown[liveId] ?? 0) + Number(rec.amount || 0)
      }
    }
    updates[`${key}/${id}`] = rec
    restored[key].add(id)
    row.toRestore++
    row.amount += Number(rec.amount ?? rec.dealerRateTotal ?? rec.depotRateTotal ?? 0)
  }
  row.amount = Math.round(row.amount * 100) / 100
  summary.push(row)
}

// Ledger rows: only those whose parent (expense / collection / invoice) is being restored.
const restoredIds = new Set(Object.values(restored).flatMap((s) => [...s]))
const ledgerRow = { collection: 'ledgerEntries', inBackup: 0, alreadyLiveId: 0, alreadyLiveContent: 0, junk: 0, orphan: 0, toRestore: 0, amount: 0 }
for (const [id, rec] of Object.entries(backup.ledgerEntries ?? {})) {
  ledgerRow.inBackup++
  if (isJunk(rec)) { ledgerRow.junk++; continue }
  if (live.ledgerEntries[id]) { ledgerRow.alreadyLiveId++; continue }
  if (!restoredIds.has(rec.orderId)) { ledgerRow.orphan++; continue }
  updates[`ledgerEntries/${id}`] = rec
  ledgerRow.toRestore++
}
summary.push(ledgerRow)

for (const [liveId, total] of Object.entries(invoicePaydown)) {
  const rc = live.rateCards[liveId]
  const paid = Math.round((Number(rc.paid || 0) + total) * 100) / 100
  const due = Math.round((Number(rc.due || 0) - total) * 100) / 100
  updates[`rateCards/${liveId}/paid`] = paid
  updates[`rateCards/${liveId}/due`] = due
  console.log(`Live invoice ${rc.invoiceNo}: paid ${rc.paid} -> ${paid}, due ${rc.due} -> ${due} (restored collections attached)`)
}
if (matches.length) console.log(`\nSkipped as already re-entered on live:\n  ${matches.join('\n  ')}\n`)

console.table(summary)
console.log('alreadyLiveId/Content = skipped as duplicate · junk = legacy/test rows · orphan = parent missing on live')
if (warnings.length) console.log(`\n${warnings.length} possible duplicates inside the backup itself:\n  ${warnings.join('\n  ')}`)
console.log(`\nLive snapshot saved: ${liveCopy}`)

if (!apply) {
  console.log('\nDry run — nothing written. Re-run with --apply to restore.')
} else {
  const paths = Object.keys(updates)
  for (let i = 0; i < paths.length; i += 400) {
    await writeUpdates(Object.fromEntries(paths.slice(i, i + 400).map((p) => [p, updates[p]])))
  }
  console.log(`\nRestored ${paths.length} records.`)
}
process.exit(0)
