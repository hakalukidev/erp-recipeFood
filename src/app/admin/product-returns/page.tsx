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
import { createId, formatDate, sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'

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
// as-is against the rate (Pcs/Kg, no per-carton/bag conversion).
function computePreviewTotals(lines: ReturnLineDraft[], returnParty: ProductReturnParty) {
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
    depotProfit: returnParty === 'dealer' ? dealerRateTotal - depotRateTotal : 0,
    returnValue: returnParty === 'depot' ? depotRateTotal : dealerRateTotal,
    manufacturingExpenseAmount: manufRateTotal,
    rawMaterialExpenseAmount: rawRateTotal * 0.1,
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

// Combined (Company-side) return voucher — every rate column plus both
// derived profit reductions this return actually pulls down (Company always,
// Depot only when returnParty is 'dealer' — see the ProductReturnRecord
// comment in types.ts). `depot` is the Depot this return cascades through —
// resolved live off the linked dealer (dealer.depotId) when returnParty is
// 'dealer', so one Dealer-return entry documents both legs without a second
// Depot-only entry — see resolveDepotForEntry in ProductReturnsPage.
function buildCombinedReturnHtml(entry: ProductReturnRecord, depot?: DepotRecord) {
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
          ${entry.returnParty === 'dealer' && depot ? `<tr><td>Depot (cascades through):</td><td>${escapeHtml(depot.name)}</td></tr>` : ''}
          <tr><td>Date:</td><td>${escapeHtml(entry.date)}</td></tr>
          <tr><td>Return Value (refunded):</td><td class="numeric hl">${formatAmount(entry.returnParty === 'depot' ? entry.depotRateTotal : entry.dealerRateTotal)}</td></tr>
          <tr><td>Company Profit (deducted):</td><td class="numeric hl">-${formatAmount(entry.companyProfit)}</td></tr>
          ${entry.returnParty === 'dealer' ? `<tr><td>Depot Profit (deducted):</td><td class="numeric hl">-${formatAmount(entry.depotProfit)}</td></tr>` : ''}
          <tr><td>Manufacturing Cost (posted as expense):</td><td class="numeric hl">-${formatAmount(entry.manufacturingExpenseAmount)}</td></tr>
          <tr><td>Raw Material 10% (posted as expense):</td><td class="numeric hl">-${formatAmount(entry.rawMaterialExpenseAmount)}</td></tr>
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
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${entry.reason ? `<p class="remarks"><strong>Reason:</strong> ${escapeHtml(entry.reason)}</p>` : ''}
        ${printFooter()}
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

// Depot's own copy — Depot P P / Depot S P for the returned qty. Relevant
// whichever party actually returned the goods, since a Dealer return
// cascades up through the Depot's own purchase from the Company too — for a
// 'dealer' returnParty, `depot` is resolved live off the linked dealer
// (dealer.depotId), never the dealer's own name, so this prints as a
// legitimate Depot adjustment document straight off the one Dealer-return
// entry (no separate Depot-only entry needed). Falls back to entry's own
// name when returnParty is 'depot' (the depot was picked directly) or the
// dealer has no linked depot on file.
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
          <tr><td>Depot Sales Price (returned):</td><td class="numeric">${formatAmount(entry.dealerRateTotal)}</td></tr>
          <tr><td>Depot Purchase Price (returned):</td><td class="numeric">${formatAmount(entry.depotRateTotal)}</td></tr>
          <tr><td>Depot Profit (deducted):</td><td class="numeric hl">-${formatAmount(entry.depotProfit)}</td></tr>
        </table>
        <table class="doc">
          <thead>
            <tr>
              <th>SL</th>
              <th>Description of Products</th>
              <th>Return QTY</th>
              <th>Depot P P</th>
              <th>Depot S P</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${entry.reason ? `<p class="remarks"><strong>Reason:</strong> ${escapeHtml(entry.reason)}</p>` : ''}
        ${printFooter()}
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

// Dealer's own copy — only printed when returnParty is 'dealer' (the goods
// actually came back from a dealer, so this is the only voucher where the
// Depot Sales Price is an active refund rather than a reference figure).
function buildDealerReturnHtml(entry: ProductReturnRecord, dealer?: DealerRecord) {
  const rows = entry.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td class="numeric">${item.qty} ${UNIT_LABEL[item.unit]}</td>
        <td class="numeric">${formatAmount(item.dealerRate)}</td>
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
          <tr><td>Goods Amount (returned):</td><td class="numeric">${formatAmount(entry.dealerRateTotal)}</td></tr>
        </table>
        <table class="doc">
          <thead>
            <tr>
              <th>SL</th>
              <th>Description of Products</th>
              <th>Return QTY</th>
              <th>Depot S P (DP)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${entry.reason ? `<p class="remarks"><strong>Reason:</strong> ${escapeHtml(entry.reason)}</p>` : ''}
        ${printFooter()}
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

export default function ProductReturnsPage() {
  const { data, createProductReturn, updateProductReturn, deleteProductReturn } = useERP()
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const depots = useMemo(() => toArray(data?.depots), [data?.depots])
  const dealers = useMemo(() => toArray(data?.dealers), [data?.dealers])
  const productReturns = useMemo(() => sortByCreatedAtDesc(toArray(data?.productReturns)), [data?.productReturns])

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
  const dealerOptions: ComboboxOption[] = useMemo(
    () => dealers.map((dealer) => ({ value: dealer.id, label: dealer.name, sublabel: dealer.address })),
    [dealers]
  )
  const depotById = useMemo(() => new Map(depots.map((depot) => [depot.id, depot])), [depots])
  const dealerById = useMemo(() => new Map(dealers.map((dealer) => [dealer.id, dealer])), [dealers])
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
  const [returnParty, setReturnParty] = useState<ProductReturnParty>('depot')
  const [depotId, setDepotId] = useState('')
  const [dealerId, setDealerId] = useState('')
  const [lines, setLines] = useState<ReturnLineDraft[]>([emptyLine()])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const previewTotals = useMemo(() => computePreviewTotals(lines, returnParty), [lines, returnParty])

  const filteredReturns = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return productReturns
    return productReturns.filter((entry) =>
      [entry.returnNumber, entry.recipientName].join(' ').toLowerCase().includes(normalized)
    )
  }, [productReturns, query])

  function openCreateDialog() {
    setEditingId(null)
    setReturnParty('depot')
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
    setReturnParty(entry.returnParty)
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
    updateLine(key, {
      productId,
      productName: product?.name ?? '',
      rawRate: product?.rawRate ?? 0,
      manufRate: product?.manufRate ?? 0,
      depotRate: product?.depotRate ?? 0,
      dealerRate: product?.dealerRate ?? 0,
      perCtnBgs: product?.packSize,
    })
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

  function openPrintWindow(html: string) {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
  }

  const totalCompanyImpact = productReturns.reduce((sum, entry) => sum + entry.companyProfit, 0)
  const totalDepotImpact = productReturns.reduce((sum, entry) => sum + entry.depotProfit, 0)
  const totalReturnValue = productReturns.reduce(
    (sum, entry) => sum + (entry.returnParty === 'depot' ? entry.depotRateTotal : entry.dealerRateTotal),
    0
  )
  const totalWriteOffImpact = productReturns.reduce(
    (sum, entry) => sum + entry.manufacturingExpenseAmount + entry.rawMaterialExpenseAmount,
    0
  )

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
              <p className="mt-1 text-xs text-muted-foreground">Depot Purchase Price or Depot Sales Price, per return</p>
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
              <p className="text-sm text-muted-foreground">Depot profit given back</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">-{formatAmount(totalDepotImpact)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Only when the return came from a Dealer</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Manufacturing + raw material written off</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">-{formatAmount(totalWriteOffImpact)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Full manufacturing cost + 10% of raw material, posted as expense</p>
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
                    <TableHead className="text-right">Company Profit</TableHead>
                    <TableHead className="text-right">Depot Profit</TableHead>
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
                      <TableCell className="text-right text-destructive">
                        -{formatAmount(entry.returnParty === 'depot' ? entry.depotRateTotal : entry.dealerRateTotal)}
                      </TableCell>
                      <TableCell className="text-right text-destructive">-{formatAmount(entry.companyProfit)}</TableCell>
                      <TableCell className="text-right text-destructive">
                        {entry.returnParty === 'dealer' ? `-${formatAmount(entry.depotProfit)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => openPrintWindow(buildCombinedReturnHtml(entry, resolveDepotForEntry(entry)))}
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
                  value={returnParty}
                  onValueChange={(value) => {
                    setReturnParty(value as ProductReturnParty)
                    setDepotId('')
                    setDealerId('')
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="depot">Depot</SelectItem>
                    <SelectItem value="dealer">Dealer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Return Date</label>
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="bg-background" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  {returnParty === 'depot' ? 'Depot' : 'Dealer'}
                </label>
                {returnParty === 'depot' ? (
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
                    options={dealerOptions}
                    value={dealerId}
                    onChange={setDealerId}
                    placeholder="Select a dealer"
                    searchPlaceholder="Search dealers..."
                    emptyText="No dealers found — add one in Dealer List first."
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
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="mr-2 h-4 w-4" />
                Add product line
              </Button>

              <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Return Value (refunded)</p>
                  <p className="text-lg font-semibold text-destructive">-{formatAmount(previewTotals.returnValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Company Profit (deducted)</p>
                  <p className="text-lg font-semibold text-destructive">-{formatAmount(previewTotals.companyProfit)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Depot Profit (deducted)</p>
                  <p className="text-lg font-semibold text-destructive">
                    {returnParty === 'dealer' ? `-${formatAmount(previewTotals.depotProfit)}` : '— (not returned via Dealer)'}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Manufacturing cost (posted as expense)</p>
                  <p className="text-lg font-semibold text-destructive">
                    -{formatAmount(previewTotals.manufacturingExpenseAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Raw material 10% (posted as expense)</p>
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
