"use client"

import { useMemo, useState } from 'react'
import { FileText, Package, Pencil, Plus, Printer, Search, Trash2, Undo2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_HELPLINE,
  COMPANY_INVOICE_FOOTER_NOTE,
  COMPANY_NAME,
} from '@/lib/erp/companyInfo'
import { useERP } from '@/lib/erp/provider'
import type { DealerRecord, DepotRecord, ProductReturnParty, ProductReturnRecord, ProductReturnUnit } from '@/lib/erp/types'
import {
  createId,
  formatDate,
  isCommissionSaleType,
  isSrDistributorType,
  isTradeSalesType,
  sortByCreatedAtDesc,
  toArray,
} from '@/lib/erp/utils'

function formatAmount(value: number) {
  return value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const UNIT_LABEL: Record<ProductReturnUnit, string> = { pcs: 'Pcs', kg: 'Kg' }

// "Returned From" now picks one of three fixed distributor buckets (each a
// Dealer Category whose name is matched by isSrDistributorType/
// isTradeSalesType/isCommissionSaleType in utils.ts) instead of a bare
// Dealer, plus Depot kept alongside as a fourth option — see the Bangla
// client request this replaced (2026-09-09): grouping dealers by distributor
// type both filters the party picker and drives which historical sale rate
// gets pulled in per line (see findLatestSoldRate below).
type DistributorType = 'sr' | 'trade_sales' | 'commission' | 'depot'

const DISTRIBUTOR_TYPE_LABELS: Record<DistributorType, string> = {
  sr: 'SR Distributor',
  trade_sales: 'Trade Sales Distributor',
  commission: 'Commission Distributor',
  depot: 'Depot',
}

// One row in the return-lines editor — the product is picked off the main
// Product List (not an invoice), so rawRate/manufRate/depotRate/dealerRate
// are auto-filled the moment a product is chosen. Depot P R and Depot S R
// (depotRate/dealerRate) can then be hand-edited: a return can land months
// or years after the sale, once the price list has already moved on, so the
// operator types in whatever rate was actually in effect at the time. See
// createProductReturn in provider.tsx, which now trusts whatever is on the
// line at save time instead of re-deriving rates itself.
type ReturnLineDraft = {
  key: string
  productId?: string
  productName: string
  qty: string
  unit: ProductReturnUnit
  rawRate: number
  manufRate: number
  depotRate: number
  dealerRate: number
  perCtnBgs?: string
  // Set when a line's rates were pulled from that dealer's own most recent
  // sale of this product (see findLatestSoldRate) rather than the flat
  // Product List — only ever set for a dealer return, purely so the form can
  // show which source the numbers came from.
  rateSource?: 'sale' | 'catalog'
}

function emptyLine(): ReturnLineDraft {
  return {
    key: createId('line'),
    productName: '',
    qty: '0',
    unit: 'pcs',
    rawRate: 0,
    manufRate: 0,
    depotRate: 0,
    dealerRate: 0,
  }
}

// Same math as computeProductReturnTotals in provider.tsx — kept in sync by
// hand since this is a live preview over uncommitted form state. Qty is used
// as-is against the rate (Pcs/Kg, no per-carton/bag conversion). Return
// value is always the Depot Purchase Price (depotRate) regardless of
// returnParty — see the returnParty comment on ProductReturnRecord in
// types.ts — so there's no separate "Depot Profit" deduction any more.
function computePreviewTotals(lines: ReturnLineDraft[]) {
  const active = lines.filter((line) => (Number(line.qty) || 0) > 0)
  const qtyOf = (line: ReturnLineDraft) => Number(line.qty) || 0

  const rawRateTotal = active.reduce((sum, line) => sum + qtyOf(line) * line.rawRate, 0)
  const manufRateTotal = active.reduce((sum, line) => sum + qtyOf(line) * line.manufRate, 0)
  const depotRateTotal = active.reduce((sum, line) => sum + qtyOf(line) * line.depotRate, 0)
  const dealerRateTotal = active.reduce((sum, line) => sum + qtyOf(line) * line.dealerRate, 0)

  return {
    rawRateTotal,
    manufRateTotal,
    depotRateTotal,
    dealerRateTotal,
    companyProfit: depotRateTotal - manufRateTotal,
    depotProfit: 0,
    returnValue: depotRateTotal,
    manufacturingExpenseAmount: manufRateTotal - rawRateTotal,
    rawMaterialExpenseAmount: rawRateTotal * 0.3,
  }
}

const PRINT_STYLES = `
          * { box-sizing: border-box; }
          @page { margin: 12mm 16mm; size: A4; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
          .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #b91c1c; }
          .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
          .subtitle { text-align: center; color: #4b5563; font-size: 13px; margin: 10px 0 16px; }
          .meta { border: 1px solid #d1d5db; border-collapse: collapse; margin-bottom: 16px; width: 60%; }
          .meta td { border: 1px solid #d1d5db; padding: 4px 8px; font-size: 13px; }
          .meta td:first-child { font-weight: 600; width: 55%; }
          .hl { background: #fee2e2; font-weight: 700; }
          table.doc { border-collapse: collapse; width: 100%; }
          table.doc th, table.doc td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 12.5px; }
          table.doc th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
          .numeric { text-align: right; white-space: nowrap; }
          tr.totals td { font-weight: 700; border-top: 2px solid #111827; }
          .remarks { margin-top: 16px; font-size: 12.5px; }
          .footnote { text-align: center; font-style: italic; font-size: 11.5px; color: #4b5563; margin-top: 16px; }
          @media print { button { display: none; } }
`

function printHeader(subtitle: string) {
  return `
        <p class="title">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_EMAIL)} &middot; Help Line: ${escapeHtml(COMPANY_HELPLINE)}</p>
        <p class="subtitle">${subtitle}</p>
  `
}

function printFooter() {
  return `<p class="footnote">${escapeHtml(COMPANY_INVOICE_FOOTER_NOTE)}</p>`
}

function partyLabel(entry: ProductReturnRecord) {
  return entry.returnParty === 'depot' ? 'Depot' : 'Dealer'
}

// Combined (Company-side) return voucher — every rate column plus the one
// profit reduction a return actually pulls down (companyProfit, always
// depotRateTotal - manufRateTotal — see the ProductReturnRecord comment in
// types.ts). `depot` is the Depot this return cascades through — resolved
// live off the linked dealer (dealer.depotId) when returnParty is 'dealer',
// so one Dealer-return entry documents both legs without a second
// Depot-only entry — see resolveDepotForEntry in ProductReturnsPage.
function buildCombinedReturnHtml(entry: ProductReturnRecord, depot?: DepotRecord, dealer?: DealerRecord) {
  const rows = entry.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td class="numeric">${item.qty} ${UNIT_LABEL[item.unit]}</td>
        <td class="numeric">${formatAmount(item.rawRate)}</td>
        <td class="numeric">${formatAmount(item.manufRate)}</td>
        <td class="numeric">${formatAmount(item.depotRate)}</td>
        <td class="numeric">${formatAmount(item.dealerRate)}</td>
        <td class="numeric">${formatAmount(item.qty * item.depotRate)}</td>
      </tr>
    `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Product Return ${escapeHtml(entry.returnNumber)}</title>
        <style>${PRINT_STYLES}</style>
      </head>
      <body>
        ${printHeader('Product Return Voucher (Combined — Company)')}
        <table class="meta">
          <tr><td>Return No:</td><td>${escapeHtml(entry.returnNumber)}</td></tr>
          <tr><td>Returned From:</td><td>${escapeHtml(partyLabel(entry))}</td></tr>
          <tr><td>${entry.returnParty === 'dealer' ? 'Dealer Name:' : 'Depot Name:'}</td><td>${escapeHtml(entry.recipientName)}</td></tr>
          ${entry.returnParty === 'dealer' && dealer?.address ? `<tr><td>Address:</td><td>${escapeHtml(dealer.address)}</td></tr>` : ''}
          ${entry.returnParty === 'dealer' && dealer?.phone ? `<tr><td>Mobile:</td><td>${escapeHtml(dealer.phone)}</td></tr>` : ''}
          ${entry.returnParty === 'depot' && depot?.address ? `<tr><td>Address:</td><td>${escapeHtml(depot.address)}</td></tr>` : ''}
          ${entry.returnParty === 'depot' && depot?.phone ? `<tr><td>Mobile:</td><td>${escapeHtml(depot.phone)}</td></tr>` : ''}
          ${entry.returnParty === 'dealer' && depot ? `<tr><td>Depot (cascades through):</td><td>${escapeHtml(depot.name)}</td></tr>` : ''}
          <tr><td>Date:</td><td>${escapeHtml(entry.date)}</td></tr>
          <tr><td>Return Value (refunded):</td><td class="numeric hl">${formatAmount(entry.depotRateTotal)}</td></tr>
          <tr><td>Company Profit (deducted):</td><td class="numeric hl">-${formatAmount(entry.companyProfit)}</td></tr>
          <tr><td>Manufacturing Cost (informational):</td><td class="numeric hl">-${formatAmount(entry.manufacturingExpenseAmount)}</td></tr>
          <tr><td>Raw Material 30% (informational):</td><td class="numeric hl">-${formatAmount(entry.rawMaterialExpenseAmount)}</td></tr>
        </table>
        <table class="doc">
          <thead>
            <tr>
              <th>SL</th>
              <th>Description of Products</th>
              <th>Return QTY</th>
              <th>Raw M</th>
              <th>Mnu Ra</th>
              <th>Dep Rate</th>
              <th>Del Rate</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="totals">
              <td colspan="7">Grand Total (Return Value)</td>
              <td class="numeric">${formatAmount(entry.depotRateTotal)}</td>
            </tr>
          </tbody>
        </table>
        ${entry.reason ? `<p class="remarks"><strong>Reason:</strong> ${escapeHtml(entry.reason)}</p>` : ''}
        ${printFooter()}
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

// Depot's own copy — Depot P P / Depot S P for the returned qty, shown side
// by side for reference. Relevant whichever party actually returned the
// goods, since a Dealer return cascades up through the Depot's own purchase
// from the Company too — for a 'dealer' returnParty, `depot` is resolved
// live off the linked dealer (dealer.depotId), never the dealer's own name,
// so this prints as a legitimate Depot adjustment document straight off the
// one Dealer-return entry (no separate Depot-only entry needed). Falls back
// to entry's own name when returnParty is 'depot' (the depot was picked
// directly) or the dealer has no linked depot on file.
//
// Per the 2026-09-10 rule (see the ProductReturnRecord.returnParty comment
// in types.ts), the actual credited return value is always the Depot
// Purchase Price (depotRate) — Depot Sales Price (dealerRate) is shown only
// as a reference figure, and the old separate "Depot Profit" deduction line
// is gone. The gap between the two (dealerRateTotal - depotRateTotal) is
// the Depot's margin on this return; it's surfaced as "Adjustment Amount"
// so it can be deducted from the Depot's accounting head at month end.
function buildDepotReturnHtml(entry: ProductReturnRecord, depot?: DepotRecord) {
  const rows = entry.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td class="numeric">${item.qty} ${UNIT_LABEL[item.unit]}</td>
        <td class="numeric">${formatAmount(item.depotRate)}</td>
        <td class="numeric">${formatAmount(item.dealerRate)}</td>
        <td class="numeric">${formatAmount(item.qty * item.depotRate)}</td>
      </tr>
    `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Depot Return Invoice ${escapeHtml(entry.returnNumber)}</title>
        <style>${PRINT_STYLES}</style>
      </head>
      <body>
        ${printHeader('Product Return Invoice — Depot copy')}
        <table class="meta">
          <tr><td>Return No:</td><td>${escapeHtml(entry.returnNumber)}</td></tr>
          <tr><td>Returned From:</td><td>${escapeHtml(partyLabel(entry))}</td></tr>
          <tr><td>Depot Name:</td><td>${escapeHtml(depot?.name || entry.recipientName)}</td></tr>
          ${depot?.address ? `<tr><td>Address:</td><td>${escapeHtml(depot.address)}</td></tr>` : ''}
          ${depot?.phone ? `<tr><td>Mobile:</td><td>${escapeHtml(depot.phone)}</td></tr>` : ''}
          ${entry.returnParty === 'dealer' ? `<tr><td>Returned by Dealer:</td><td>${escapeHtml(entry.recipientName)}</td></tr>` : ''}
          <tr><td>Date:</td><td>${escapeHtml(entry.date)}</td></tr>
          <tr><td>Depot Sales Price (reference):</td><td class="numeric">${formatAmount(entry.dealerRateTotal)}</td></tr>
          <tr><td>Return Value (credited at Depot Purchase Price):</td><td class="numeric hl">${formatAmount(entry.depotRateTotal)}</td></tr>
          <tr><td>Depot Profit (adjust from Depot Head):</td><td class="numeric hl">${formatAmount(entry.dealerRateTotal - entry.depotRateTotal)}</td></tr>
        </table>
        <table class="doc">
          <thead>
            <tr>
              <th>SL</th>
              <th>Description of Products</th>
              <th>Return QTY</th>
              <th>Depot P P</th>
              <th>Depot S P</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="totals">
              <td colspan="5">Grand Total (Return Value)</td>
              <td class="numeric">${formatAmount(entry.depotRateTotal)}</td>
            </tr>
          </tbody>
        </table>
        ${entry.reason ? `<p class="remarks"><strong>Reason:</strong> ${escapeHtml(entry.reason)}</p>` : ''}
        ${printFooter()}
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

// Dealer's own copy — only printed when returnParty is 'dealer' (the goods
// actually came back from a dealer). Depot Sales Price (dealerRate, what the
// dealer was actually charged) is shown per line for reference, but per the
// 2026-09-10 rule (see the ProductReturnRecord.returnParty comment in
// types.ts) the actual amount credited is always the Depot Purchase Price
// (depotRate), same as every other copy of this voucher.
function buildDealerReturnHtml(entry: ProductReturnRecord, dealer?: DealerRecord) {
  const rows = entry.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td class="numeric">${item.qty} ${UNIT_LABEL[item.unit]}</td>
        <td class="numeric">${formatAmount(item.dealerRate)}</td>
        <td class="numeric">${formatAmount(item.qty * item.depotRate)}</td>
      </tr>
    `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Dealer Return Invoice ${escapeHtml(entry.returnNumber)}</title>
        <style>${PRINT_STYLES}</style>
      </head>
      <body>
        ${printHeader('Product Return Invoice — Dealer copy')}
        <table class="meta">
          <tr><td>Return No:</td><td>${escapeHtml(entry.returnNumber)}</td></tr>
          <tr><td>Dealer Name:</td><td>${escapeHtml(entry.recipientName)}</td></tr>
          ${dealer?.address ? `<tr><td>Address:</td><td>${escapeHtml(dealer.address)}</td></tr>` : ''}
          ${dealer?.phone ? `<tr><td>Mobile:</td><td>${escapeHtml(dealer.phone)}</td></tr>` : ''}
          <tr><td>Date:</td><td>${escapeHtml(entry.date)}</td></tr>
          <tr><td>Goods Amount (returned at Depot Rate):</td><td class="numeric">${formatAmount(entry.depotRateTotal)}</td></tr>
        </table>
        <table class="doc">
          <thead>
            <tr>
              <th>SL</th>
              <th>Description of Products</th>
              <th>Return QTY</th>
              <th>Depot S P (DP)</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="totals">
              <td colspan="4">Grand Total (Goods Amount returned)</td>
              <td class="numeric">${formatAmount(entry.depotRateTotal)}</td>
            </tr>
          </tbody>
        </table>
        ${entry.reason ? `<p class="remarks"><strong>Reason:</strong> ${escapeHtml(entry.reason)}</p>` : ''}
        ${printFooter()}
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

export default function ProductReturnsPage() {
  const { data, createProductReturn, updateProductReturn, deleteProductReturn, recalculateProductReturnExpenses } =
    useERP()
  const [recalculating, setRecalculating] = useState(false)
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const depots = useMemo(() => toArray(data?.depots), [data?.depots])
  const dealers = useMemo(() => toArray(data?.dealers), [data?.dealers])
  const dealerCategories = useMemo(() => toArray(data?.dealerCategories), [data?.dealerCategories])
  const rateCards = useMemo(() => toArray(data?.rateCards), [data?.rateCards])
  const productReturns = useMemo(() => sortByCreatedAtDesc(toArray(data?.productReturns)), [data?.productReturns])

  // Which of the three fixed buckets a dealer's own category (DealerRecord.
  // categoryId) falls into — reuses the same name-matching rules the invoice
  // Sale type selector uses for Commission/Trade Sales (see utils.ts) plus
  // the new SR bucket, so "distributor type" means the same thing everywhere
  // in the app.
  function distributorTypeMatchesDealer(dealer: DealerRecord, type: DistributorType) {
    if (type === 'sr') return isSrDistributorType(dealer.categoryId, dealerCategories)
    if (type === 'trade_sales') return isTradeSalesType(dealer.categoryId, dealerCategories)
    if (type === 'commission') return isCommissionSaleType(dealer.categoryId, dealerCategories)
    return false
  }

  const productOptions: ComboboxOption[] = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        sublabel: product.category,
      })),
    [products]
  )
  const depotOptions: ComboboxOption[] = useMemo(
    () => depots.map((depot) => ({ value: depot.id, label: depot.name, sublabel: depot.address })),
    [depots]
  )
  const depotById = useMemo(() => new Map(depots.map((depot) => [depot.id, depot])), [depots])
  const dealerById = useMemo(() => new Map(dealers.map((dealer) => [dealer.id, dealer])), [dealers])
  // Resolves which distributor bucket a saved return's dealer actually falls
  // into, so re-opening it for edit pre-selects the right "Returned From"
  // option instead of always defaulting to the first one.
  const resolveDistributorTypeForEntry = (entry: ProductReturnRecord): DistributorType => {
    if (entry.returnParty === 'depot') return 'depot'
    const dealer = entry.dealerId ? dealerById.get(entry.dealerId) : undefined
    if (dealer && distributorTypeMatchesDealer(dealer, 'commission')) return 'commission'
    if (dealer && distributorTypeMatchesDealer(dealer, 'trade_sales')) return 'trade_sales'
    return 'sr'
  }
  // Most recent Rate Card (invoice) line this dealer was actually charged for
  // this product — the "specific price it was sold at" the client asked for,
  // rather than today's flat Product List rate. Ties broken by date then
  // createdAt so the truly latest sale wins when several land on one day.
  function findLatestSoldRate(forDealerId: string, productId: string) {
    let best: (typeof rateCards)[number]['items'][number] | undefined
    let bestKey = ''
    for (const card of rateCards) {
      if (card.dealerId !== forDealerId) continue
      for (const item of card.items) {
        if (item.productId !== productId) continue
        const key = `${card.date}_${card.createdAt}`
        if (key > bestKey) {
          bestKey = key
          best = item
        }
      }
    }
    return best
  }
  // Resolves the Depot a return actually cascades through — direct pick for
  // a 'depot' returnParty, or live off the linked dealer (dealer.depotId)
  // for a 'dealer' returnParty, the same way rate-card's depotForDealerId
  // resolves a dealer invoice's real "From" party. Lets one Dealer-return
  // entry print a legitimate Depot voucher too, no second Depot-only entry.
  const resolveDepotForEntry = (entry: ProductReturnRecord) => {
    if (entry.depotId) return depotById.get(entry.depotId)
    if (entry.dealerId) {
      const dealer = dealerById.get(entry.dealerId)
      return dealer?.depotId ? depotById.get(dealer.depotId) : undefined
    }
    return undefined
  }
  const resolveDealerForEntry = (entry: ProductReturnRecord) => (entry.dealerId ? dealerById.get(entry.dealerId) : undefined)

  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [distributorType, setDistributorType] = useState<DistributorType>('sr')
  const returnParty: ProductReturnParty = distributorType === 'depot' ? 'depot' : 'dealer'
  const [depotId, setDepotId] = useState('')
  const [dealerId, setDealerId] = useState('')
  const [lines, setLines] = useState<ReturnLineDraft[]>([emptyLine()])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Dealers whose own category falls under the selected distributor type —
  // plus the currently-picked dealer even if it doesn't match, so re-opening
  // an old return for edit never shows an unexpectedly empty picker.
  const dealerOptionsForDistributorType: ComboboxOption[] = useMemo(() => {
    if (distributorType === 'depot') return []
    return dealers
      .filter((dealer) => distributorTypeMatchesDealer(dealer, distributorType) || dealer.id === dealerId)
      .map((dealer) => ({ value: dealer.id, label: dealer.name, sublabel: dealer.address }))
  }, [dealers, distributorType, dealerId, dealerCategories])

  const previewTotals = useMemo(() => computePreviewTotals(lines), [lines])

  const filteredReturns = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return productReturns
    return productReturns.filter((entry) =>
      [entry.returnNumber, entry.recipientName].join(' ').toLowerCase().includes(normalized)
    )
  }, [productReturns, query])

  function openCreateDialog() {
    setEditingId(null)
    setDistributorType('sr')
    setDepotId('')
    setDealerId('')
    setLines([emptyLine()])
    setDate(new Date().toISOString().slice(0, 10))
    setReason('')
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(entry: ProductReturnRecord) {
    setEditingId(entry.id)
    setDistributorType(resolveDistributorTypeForEntry(entry))
    setDepotId(entry.depotId ?? '')
    setDealerId(entry.dealerId ?? '')
    setLines(
      entry.items.map((item) => ({
        key: createId('line'),
        productId: item.productId,
        productName: item.productName,
        qty: String(item.qty),
        unit: item.unit,
        rawRate: item.rawRate,
        manufRate: item.manufRate,
        depotRate: item.depotRate,
        dealerRate: item.dealerRate,
        perCtnBgs: item.perCtnBgs,
      }))
    )
    setDate(entry.date)
    setReason(entry.reason ?? '')
    setFormError(null)
    setDialogOpen(true)
  }

  function updateLine(key: string, patch: Partial<ReturnLineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function selectLineProduct(key: string, productId: string) {
    const product = products.find((item) => item.id === productId)
    // A dealer return prefers the rate this exact dealer was actually
    // charged the last time this product was invoiced to them — falls back
    // to the flat Product List rate when there's no sale on record yet (a
    // brand-new dealer, or a product never sold to them before).
    const soldItem = returnParty === 'dealer' && dealerId ? findLatestSoldRate(dealerId, productId) : undefined
    updateLine(key, {
      productId,
      productName: soldItem?.productName || product?.name || '',
      rawRate: soldItem?.rawRate ?? product?.rawRate ?? 0,
      manufRate: soldItem?.manufRate ?? product?.manufRate ?? 0,
      depotRate: soldItem?.depotRate ?? product?.depotRate ?? 0,
      dealerRate: soldItem?.dealerRate ?? product?.dealerRate ?? 0,
      perCtnBgs: soldItem?.perCtnBgs ?? product?.packSize,
      rateSource: soldItem ? 'sale' : returnParty === 'dealer' && dealerId ? 'catalog' : undefined,
    })
  }

  // Dealer picker's onChange — beyond just recording the choice, re-derives
  // every already-picked line's rates against the newly selected dealer's
  // own sale history (see findLatestSoldRate), so switching dealers after
  // adding products doesn't leave stale rates from the previous dealer/the
  // flat catalog behind. When this dealer has no recorded sale of a line's
  // product, falls through to that product's current Product List rate
  // (never leaves the line showing whatever number happened to be on it
  // before — that was the bug: re-selecting a dealer with no sale history
  // silently kept the *previous* dealer's numbers on screen).
  function selectDealer(value: string) {
    setDealerId(value)
    setLines((current) =>
      current.map((line) => {
        if (!line.productId) return line
        const soldItem = findLatestSoldRate(value, line.productId)
        if (soldItem) {
          return {
            ...line,
            rawRate: soldItem.rawRate,
            manufRate: soldItem.manufRate,
            depotRate: soldItem.depotRate,
            dealerRate: soldItem.dealerRate,
            perCtnBgs: soldItem.perCtnBgs ?? line.perCtnBgs,
            rateSource: 'sale',
          }
        }
        const product = products.find((item) => item.id === line.productId)
        return {
          ...line,
          rawRate: product?.rawRate ?? 0,
          manufRate: product?.manufRate ?? 0,
          depotRate: product?.depotRate ?? 0,
          dealerRate: product?.dealerRate ?? 0,
          perCtnBgs: product?.packSize ?? line.perCtnBgs,
          rateSource: 'catalog',
        }
      })
    )
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()])
  }

  function removeLine(key: string) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current))
  }

  async function handleSave() {
    setFormError(null)

    if (returnParty === 'depot' && !depotId) {
      setFormError('Pick the depot this return is against.')
      return
    }
    if (returnParty === 'dealer' && !dealerId) {
      setFormError('Pick the dealer this return is against.')
      return
    }

    const items = lines
      .filter((line) => line.productId && (Number(line.qty) || 0) > 0)
      .map((line) => ({
        productId: line.productId,
        productName: line.productName,
        qty: Number(line.qty) || 0,
        unit: line.unit,
        rawRate: line.rawRate,
        manufRate: line.manufRate,
        depotRate: line.depotRate,
        dealerRate: line.dealerRate,
        perCtnBgs: line.perCtnBgs,
      }))

    if (items.length === 0) {
      setFormError('Pick at least one product and enter a return quantity.')
      return
    }

    setSaving(true)
    try {
      const input = {
        returnParty,
        depotId: returnParty === 'depot' ? depotId : undefined,
        dealerId: returnParty === 'dealer' ? dealerId : undefined,
        date,
        reason: reason.trim() || undefined,
        items,
      }
      if (editingId) {
        await updateProductReturn(editingId, input)
        setFeedback('Product return updated.')
      } else {
        await createProductReturn(input)
        setFeedback('Product return recorded — print the combined or party voucher from the row actions.')
      }
      setDialogOpen(false)
      setEditingId(null)
    } catch (reason_) {
      setFormError(
        reason_ instanceof Error ? reason_.message : `Unable to ${editingId ? 'update' : 'record'} product return.`
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(entry: ProductReturnRecord) {
    setFeedback(null)
    try {
      await deleteProductReturn(entry.id)
      setFeedback(`Deleted product return ${entry.returnNumber}.`)
    } catch (reason_) {
      setFeedback(reason_ instanceof Error ? reason_.message : 'Unable to delete product return.')
    }
  }

  // One-off cleanup button for the 2026-09-10 change: product returns no
  // longer post their manufacturing/raw-material write-off as a real
  // ExpenseRecord (it double-counted against Company Profit and inflated
  // Company Earnings' Total Expenses) — see recalculateProductReturnExpenses
  // in provider.tsx. This removes any such expense still linked to an older
  // return. Safe to click more than once; already-clean returns are skipped.
  async function handleRecalculate() {
    setFeedback(null)
    setRecalculating(true)
    try {
      const changed = await recalculateProductReturnExpenses()
      setFeedback(
        changed > 0
          ? `Removed write-off expenses from ${changed} older product return(s) — they no longer count against Total Expenses.`
          : 'No product returns had write-off expenses posted — nothing to clean up.'
      )
    } catch (reason_) {
      setFeedback(reason_ instanceof Error ? reason_.message : 'Unable to clean up product returns.')
    } finally {
      setRecalculating(false)
    }
  }

  function openPrintWindow(html: string) {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
  }

  const totalCompanyImpact = productReturns.reduce((sum, entry) => sum + entry.companyProfit, 0)
  const totalReturnValue = productReturns.reduce((sum, entry) => sum + entry.depotRateTotal, 0)
  const totalWriteOffImpact = productReturns.reduce(
    (sum, entry) => sum + entry.manufacturingExpenseAmount + entry.rawMaterialExpenseAmount,
    0
  )
  const totalDepotProfit = productReturns.reduce((sum, entry) => sum + (entry.dealerRateTotal - entry.depotRateTotal), 0)

  return (
    <AdminShell active="Product Return">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Product returns</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{productReturns.length.toLocaleString('en-BD')}</p>
              <p className="mt-1 text-xs text-muted-foreground">Picked from the Product List, no invoice needed</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total return value refunded</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">-{formatAmount(totalReturnValue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Always credited at Depot Purchase Price, per return</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Depot profit (adjust from Depot Head)</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{formatAmount(totalDepotProfit)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Depot Sales Price − Return Value, deduct at month end</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Company profit given back</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">-{formatAmount(totalCompanyImpact)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Deducted from Company Earnings' gross profit</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Manufacturing + raw material cost impact</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">-{formatAmount(totalWriteOffImpact)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Informational only — not posted to Expenses (Company Profit already covers it)</p>
            </CardContent>
          </Card>
        </div>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Product Return</CardTitle>
              <CardDescription>
                Damage or return entry, independent of any invoice — pick any product off the Product List (however
                old), enter how much came back in Pcs or Kg, and adjust the Depot Purchase Price / Depot Sales Price
                if the rate has moved since. Picking a Dealer covers both legs in one entry — the Depot it's linked to
                gets its adjustment automatically, so there's no need to also record a separate Depot-only return.
              </CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search return no or party"
                />
              </div>
              <Button variant="outline" onClick={handleRecalculate} disabled={recalculating}>
                {recalculating ? 'Cleaning up…' : 'Remove old write-off expenses'}
              </Button>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                New Product Return
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Return No</TableHead>
                    <TableHead>Returned From</TableHead>
                    <TableHead>Depot / Dealer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Return Value</TableHead>
                    <TableHead className="text-right">Depot Profit</TableHead>
                    <TableHead className="text-right">Company Profit</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReturns.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.returnNumber}</TableCell>
                      <TableCell>{partyLabel(entry)}</TableCell>
                      <TableCell>{entry.recipientName}</TableCell>
                      <TableCell>{formatDate(entry.date)}</TableCell>
                      <TableCell className="text-right text-destructive">-{formatAmount(entry.depotRateTotal)}</TableCell>
                      <TableCell className="text-right">{formatAmount(entry.dealerRateTotal - entry.depotRateTotal)}</TableCell>
                      <TableCell className="text-right text-destructive">-{formatAmount(entry.companyProfit)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                openPrintWindow(
                                  buildCombinedReturnHtml(entry, resolveDepotForEntry(entry), resolveDealerForEntry(entry))
                                )
                              }
                            >
                              <Printer className="mr-2 h-4 w-4" /> Print Combined voucher
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openPrintWindow(buildDepotReturnHtml(entry, resolveDepotForEntry(entry)))}
                            >
                              <Printer className="mr-2 h-4 w-4" /> Print Depot voucher
                            </DropdownMenuItem>
                            {entry.returnParty === 'dealer' ? (
                              <DropdownMenuItem
                                onClick={() => openPrintWindow(buildDealerReturnHtml(entry, resolveDealerForEntry(entry)))}
                              >
                                <Printer className="mr-2 h-4 w-4" /> Print Dealer voucher
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem onClick={() => openEditDialog(entry)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(entry)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredReturns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                        <Undo2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        No product returns yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingId(null)
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto p-0 sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <FileText className="h-4.5 w-4.5" />
              </span>
              <div>
                <DialogTitle>{editingId ? 'Edit product return' : 'New product return'}</DialogTitle>
                <DialogDescription>
                  {editingId
                    ? 'Update the quantity, rates, or party for this return entry, then save.'
                    : 'Pick who returned it, then add products from the Product List with the qty that came back — Depot P R / Depot S R can be edited per line if the rate has changed since.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 px-6 pb-6">
            <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Returned From</label>
                <Select
                  value={distributorType}
                  onValueChange={(value) => {
                    if (value === distributorType) return
                    setDistributorType(value as DistributorType)
                    setDepotId('')
                    setDealerId('')
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sr">SR Distributors</SelectItem>
                    <SelectItem value="trade_sales">Trade Sales Distributors</SelectItem>
                    <SelectItem value="commission">Commission Distributors</SelectItem>
                    <SelectItem value="depot">Depot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Return Date</label>
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="bg-background" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">{DISTRIBUTOR_TYPE_LABELS[distributorType]}</label>
                {distributorType === 'depot' ? (
                  <Combobox
                    options={depotOptions}
                    value={depotId}
                    onChange={setDepotId}
                    placeholder="Select a depot"
                    searchPlaceholder="Search depots..."
                    emptyText="No depots found — add one in Depot List first."
                  />
                ) : (
                  <Combobox
                    options={dealerOptionsForDistributorType}
                    value={dealerId}
                    onChange={selectDealer}
                    placeholder={`Select a ${DISTRIBUTOR_TYPE_LABELS[distributorType].toLowerCase()}`}
                    searchPlaceholder="Search dealers..."
                    emptyText={`No ${DISTRIBUTOR_TYPE_LABELS[distributorType]}s found — check Dealer Category on the Dealer List.`}
                  />
                )}
                {returnParty === 'dealer' && dealerId
                  ? (() => {
                      const selectedDealerDepotId = dealerById.get(dealerId)?.depotId
                      const linkedDepot = selectedDealerDepotId ? depotById.get(selectedDealerDepotId) : undefined
                      return linkedDepot ? (
                        <p className="text-xs text-muted-foreground">
                          Also adjusts Depot &ldquo;{linkedDepot.name}&rdquo; automatically — no separate Depot entry needed.
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600">
                          This dealer isn&apos;t linked to a Depot yet — link it in Depot List to also print a Depot
                          voucher from this entry.
                        </p>
                      )
                    })()
                  : null}
              </div>
            </div>

            {/* Cards, not a <Table>, on purpose — the Combobox's dropdown is
                absolutely positioned relative to this row, and a horizontally
                scrolling table (overflow-x-auto) clips that popover to a tiny
                sliver instead of letting it float over the rest of the row.
                See the same note in rate-card/page.tsx. */}
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div
                  key={line.key}
                  className="space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Combobox
                        options={productOptions}
                        value={line.productId ?? ''}
                        onChange={(value) => selectLineProduct(line.key, value)}
                        placeholder="Select product"
                        searchPlaceholder="Search products..."
                        emptyText="No products found — add one in the Product List first."
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLine(line.key)}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Qty</label>
                      <Input
                        type="number"
                        min={0}
                        value={line.qty}
                        onChange={(event) => updateLine(line.key, { qty: event.target.value })}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Unit</label>
                      <Select value={line.unit} onValueChange={(value) => updateLine(line.key, { unit: value as ProductReturnUnit })}>
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pcs">Pcs</SelectItem>
                          <SelectItem value="kg">Kg</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Depot P R</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.depotRate}
                        onChange={(event) => updateLine(line.key, { depotRate: Number(event.target.value) || 0 })}
                        className="bg-background text-right"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Depot S R</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.dealerRate}
                        onChange={(event) => updateLine(line.key, { dealerRate: Number(event.target.value) || 0 })}
                        className="bg-background text-right"
                      />
                    </div>
                  </div>
                  {line.rateSource === 'sale' ? (
                    <p className="text-xs text-emerald-600">
                      Rate auto-filled from this dealer&apos;s most recent sale of this product.
                    </p>
                  ) : line.rateSource === 'catalog' ? (
                    <p className="text-xs text-muted-foreground">
                      No sale on record for this dealer yet — using the Product List rate; edit if needed.
                    </p>
                  ) : null}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="mr-2 h-4 w-4" />
                Add product line
              </Button>

              <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Return Value (credited at Depot Rate)</p>
                  <p className="text-lg font-semibold text-destructive">-{formatAmount(previewTotals.returnValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Company Profit (deducted)</p>
                  <p className="text-lg font-semibold text-destructive">-{formatAmount(previewTotals.companyProfit)}</p>
                </div>
              </div>

              <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Manufacturing cost (informational)</p>
                  <p className="text-lg font-semibold text-destructive">
                    -{formatAmount(previewTotals.manufacturingExpenseAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Raw material 30% (informational)</p>
                  <p className="text-lg font-semibold text-destructive">
                    -{formatAmount(previewTotals.rawMaterialExpenseAmount)}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why is this being returned?"
                  className="bg-background"
                />
              </div>
            </div>

            {products.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
                The Product List is empty — add products there first.
              </div>
            ) : null}

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

            <div className="flex justify-end gap-3 border-t border-border/60 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false)
                  setEditingId(null)
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Record return'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
