"use client"

import { useMemo, useState } from 'react'
import { FileText, Package, Plus, Printer, Search, Trash2, Undo2 } from 'lucide-react'

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { COMPANY_ADDRESS, COMPANY_EMAIL, COMPANY_HELPLINE, COMPANY_NAME } from '@/lib/erp/companyInfo'
import { useERP } from '@/lib/erp/provider'
import type { ProductReturnRecord, RateCardRecord } from '@/lib/erp/types'
import { formatDate, parsePerCtnMultiplier, sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'

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

// One row in the return-lines editor — sourced from the picked invoice's own
// line items, so only `returnQty` is ever typed in; every rate column is
// copied straight off the invoice, same as the provider (createProductReturn)
// re-derives it server-side.
type ReturnLineDraft = {
  productId?: string
  productName: string
  invoicedQty: number
  alreadyReturnedQty: number
  returnQty: string
  rawRate: number
  manufRate: number
  depotRate: number
  dealerRate: number
  tpRate: number
  mrpRate: number
  perCtnBgs?: string
}

function buildDraftLines(rateCard: RateCardRecord, existingReturns: ProductReturnRecord[]): ReturnLineDraft[] {
  const returnedByProduct = new Map<string, number>()
  existingReturns
    .filter((entry) => entry.rateCardId === rateCard.id)
    .forEach((entry) => {
      entry.items.forEach((item) => {
        const key = item.productId || item.productName
        returnedByProduct.set(key, (returnedByProduct.get(key) ?? 0) + item.qty)
      })
    })

  return rateCard.items.map((line) => {
    const key = line.productId || line.productName
    return {
      productId: line.productId,
      productName: line.productName,
      invoicedQty: line.qty,
      alreadyReturnedQty: returnedByProduct.get(key) ?? 0,
      returnQty: '0',
      rawRate: line.rawRate,
      manufRate: line.manufRate,
      depotRate: line.depotRate,
      dealerRate: line.dealerRate,
      tpRate: line.tpRate ?? 0,
      mrpRate: line.mrpRate ?? 0,
      perCtnBgs: line.perCtnBgs,
    }
  })
}

// Same cascade math as computeProductReturnTotals in provider.tsx — kept in
// sync by hand since this is a live preview over uncommitted form state.
function computePreviewTotals(lines: ReturnLineDraft[]) {
  const active = lines.filter((line) => (Number(line.returnQty) || 0) > 0)
  const pieces = (line: ReturnLineDraft) => (Number(line.returnQty) || 0) * parsePerCtnMultiplier(line.perCtnBgs)

  const rawRateTotal = active.reduce((sum, line) => sum + pieces(line) * line.rawRate, 0)
  const manufRateTotal = active.reduce((sum, line) => sum + pieces(line) * line.manufRate, 0)
  const depotRateTotal = active.reduce((sum, line) => sum + pieces(line) * line.depotRate, 0)
  const dealerRateTotal = active.reduce((sum, line) => sum + pieces(line) * line.dealerRate, 0)
  const tpRateTotal = active.reduce((sum, line) => sum + pieces(line) * line.tpRate, 0)

  return {
    rawRateTotal,
    manufRateTotal,
    depotRateTotal,
    dealerRateTotal,
    tpRateTotal,
    companyProfit: depotRateTotal - manufRateTotal,
    depotProfit: dealerRateTotal - depotRateTotal,
    dealerProfit: tpRateTotal - dealerRateTotal,
    // Sunk-cost write-off — kept in sync with createProductReturn's
    // postWriteOffExpense in provider.tsx: full manufacturing cost, plus 10%
    // of raw material cost, posted as expense entries.
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

// Combined (Company-side) return voucher — every rate column plus all three
// profit reductions (Dealer/Depot/Company), mirroring buildRateCardHtml's
// Company voucher but for goods coming back instead of going out.
function buildCombinedReturnHtml(entry: ProductReturnRecord) {
  const rows = entry.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td class="numeric">${item.qty}</td>
        <td>${escapeHtml(item.perCtnBgs ?? '')}</td>
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
          <tr><td>Against Invoice No:</td><td>${escapeHtml(entry.invoiceNo)}</td></tr>
          <tr><td>Dealer / Recipient:</td><td>${escapeHtml(entry.recipientName)}</td></tr>
          <tr><td>Date:</td><td>${escapeHtml(entry.date)}</td></tr>
          <tr><td>Company Profit (deducted):</td><td class="numeric hl">-${formatAmount(entry.companyProfit)}</td></tr>
          <tr><td>Depot Profit (deducted):</td><td class="numeric hl">-${formatAmount(entry.depotProfit)}</td></tr>
          <tr><td>Dealer Profit (deducted):</td><td class="numeric hl">-${formatAmount(entry.dealerProfit)}</td></tr>
          <tr><td>Manufacturing Cost (posted as expense):</td><td class="numeric hl">-${formatAmount(entry.manufacturingExpenseAmount)}</td></tr>
          <tr><td>Raw Material 10% (posted as expense):</td><td class="numeric hl">-${formatAmount(entry.rawMaterialExpenseAmount)}</td></tr>
        </table>
        <table class="doc">
          <thead>
            <tr>
              <th>SL</th>
              <th>Description of Products</th>
              <th>Return QTY</th>
              <th>Per Ctn/Bgs</th>
              <th>Raw M</th>
              <th>Mnu Ra</th>
              <th>Dep Rate</th>
              <th>Del Rate</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${entry.reason ? `<p class="remarks"><strong>Reason:</strong> ${escapeHtml(entry.reason)}</p>` : ''}
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

// Depot's own copy — Depot P P / Depot S P for the returned qty and how much
// comes off its own margin (mirrors buildDepotInvoiceHtml's Depot Net Profit).
function buildDepotReturnHtml(entry: ProductReturnRecord) {
  const rows = entry.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td class="numeric">${item.qty}</td>
        <td>${escapeHtml(item.perCtnBgs ?? '')}</td>
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
          <tr><td>Against Invoice No:</td><td>${escapeHtml(entry.invoiceNo)}</td></tr>
          <tr><td>Depot / Dealer Name:</td><td>${escapeHtml(entry.recipientName)}</td></tr>
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
              <th>Per Ctn/Bgs</th>
              <th>Depot P P</th>
              <th>Depot S P</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${entry.reason ? `<p class="remarks"><strong>Reason:</strong> ${escapeHtml(entry.reason)}</p>` : ''}
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

// Dealer's own copy — DP/TP for the returned qty and the dealer's own margin
// given back (mirrors buildDealerInvoiceHtml's Dealer Margin).
function buildDealerReturnHtml(entry: ProductReturnRecord) {
  const rows = entry.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td class="numeric">${item.qty}</td>
        <td>${escapeHtml(item.perCtnBgs ?? '')}</td>
        <td class="numeric">${formatAmount(item.dealerRate)}</td>
        <td class="numeric">${formatAmount(item.tpRate ?? 0)}</td>
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
          <tr><td>Against Invoice No:</td><td>${escapeHtml(entry.invoiceNo)}</td></tr>
          <tr><td>Dealer Name:</td><td>${escapeHtml(entry.recipientName)}</td></tr>
          <tr><td>Date:</td><td>${escapeHtml(entry.date)}</td></tr>
          <tr><td>Goods Amount (returned):</td><td class="numeric">${formatAmount(entry.dealerRateTotal)}</td></tr>
          <tr><td>Dealer Profit (deducted):</td><td class="numeric hl">-${formatAmount(entry.dealerProfit)}</td></tr>
        </table>
        <table class="doc">
          <thead>
            <tr>
              <th>SL</th>
              <th>Description of Products</th>
              <th>Return QTY</th>
              <th>Per Ctn/Bgs</th>
              <th>DP</th>
              <th>TP</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${entry.reason ? `<p class="remarks"><strong>Reason:</strong> ${escapeHtml(entry.reason)}</p>` : ''}
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

export default function ProductReturnsPage() {
  const { data, createProductReturn, deleteProductReturn } = useERP()
  const rateCards = useMemo(() => toArray(data?.rateCards), [data?.rateCards])
  const productReturns = useMemo(() => sortByCreatedAtDesc(toArray(data?.productReturns)), [data?.productReturns])

  const invoiceOptions: ComboboxOption[] = useMemo(
    () =>
      rateCards.map((card) => ({
        value: card.id,
        label: card.invoiceNo,
        sublabel: card.recipientName,
      })),
    [rateCards]
  )

  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [rateCardId, setRateCardId] = useState('')
  const [lines, setLines] = useState<ReturnLineDraft[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const selectedRateCard = rateCards.find((card) => card.id === rateCardId) ?? null
  const previewTotals = useMemo(() => computePreviewTotals(lines), [lines])

  const filteredReturns = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return productReturns
    return productReturns.filter((entry) =>
      [entry.returnNumber, entry.invoiceNo, entry.recipientName].join(' ').toLowerCase().includes(normalized)
    )
  }, [productReturns, query])

  function openCreateDialog() {
    setRateCardId('')
    setLines([])
    setDate(new Date().toISOString().slice(0, 10))
    setReason('')
    setFormError(null)
    setDialogOpen(true)
  }

  function selectInvoice(id: string) {
    setRateCardId(id)
    const card = rateCards.find((item) => item.id === id)
    setLines(card ? buildDraftLines(card, productReturns) : [])
  }

  function updateLineQty(index: number, value: string) {
    setLines((current) => current.map((line, idx) => (idx === index ? { ...line, returnQty: value } : line)))
  }

  async function handleSave() {
    setFormError(null)

    if (!selectedRateCard) {
      setFormError('Pick the invoice this return is against.')
      return
    }

    const items = lines
      .filter((line) => (Number(line.returnQty) || 0) > 0)
      .map((line) => ({
        productId: line.productId,
        productName: line.productName,
        qty: Number(line.returnQty) || 0,
      }))

    if (items.length === 0) {
      setFormError('Enter a return quantity for at least one product.')
      return
    }

    const overLine = lines.find(
      (line) => (Number(line.returnQty) || 0) + line.alreadyReturnedQty > line.invoicedQty
    )
    if (overLine) {
      setFormError(`Cannot return more than what was invoiced for ${overLine.productName}.`)
      return
    }

    setSaving(true)
    try {
      await createProductReturn({
        rateCardId: selectedRateCard.id,
        date,
        reason: reason.trim() || undefined,
        items,
      })
      setDialogOpen(false)
      setFeedback('Product return recorded — print the combined or individual voucher from the row actions.')
    } catch (reason_) {
      setFormError(reason_ instanceof Error ? reason_.message : 'Unable to record product return.')
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
  const totalDealerImpact = productReturns.reduce((sum, entry) => sum + entry.dealerProfit, 0)
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
              <p className="mt-1 text-xs text-muted-foreground">Each prints as a Combined, Depot &amp; Dealer voucher</p>
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
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Dealer profit given back</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">-{formatAmount(totalDealerImpact)}</p>
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
                Return goods against a previously saved invoice — dealer, depot and company profit on that shipment
                are all reduced, and the company's gross profit drops by the same amount.
              </CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search return no or invoice"
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
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Dealer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Company Profit</TableHead>
                    <TableHead className="text-right">Depot Profit</TableHead>
                    <TableHead className="text-right">Dealer Profit</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReturns.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.returnNumber}</TableCell>
                      <TableCell>{entry.invoiceNo}</TableCell>
                      <TableCell>{entry.recipientName}</TableCell>
                      <TableCell>{formatDate(entry.date)}</TableCell>
                      <TableCell className="text-right text-destructive">-{formatAmount(entry.companyProfit)}</TableCell>
                      <TableCell className="text-right text-destructive">-{formatAmount(entry.depotProfit)}</TableCell>
                      <TableCell className="text-right text-destructive">-{formatAmount(entry.dealerProfit)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openPrintWindow(buildCombinedReturnHtml(entry))}>
                              <Printer className="mr-2 h-4 w-4" /> Print Combined voucher
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPrintWindow(buildDepotReturnHtml(entry))}>
                              <Printer className="mr-2 h-4 w-4" /> Print Depot voucher
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPrintWindow(buildDealerReturnHtml(entry))}>
                              <Printer className="mr-2 h-4 w-4" /> Print Dealer voucher
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto p-0 sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <FileText className="h-4.5 w-4.5" />
              </span>
              <div>
                <DialogTitle>New product return</DialogTitle>
                <DialogDescription>Pick the invoice, then enter how much of each line came back.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 px-6 pb-6">
            <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Against Invoice</label>
                <Combobox
                  options={invoiceOptions}
                  value={rateCardId}
                  onChange={selectInvoice}
                  placeholder="Select invoice no"
                  searchPlaceholder="Search invoice no or dealer"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Return Date</label>
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="bg-background" />
              </div>
            </div>

            {selectedRateCard ? (
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-xl border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Invoiced Qty</TableHead>
                        <TableHead className="text-right">Already Returned</TableHead>
                        <TableHead className="text-right">Return Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, index) => {
                        const remaining = line.invoicedQty - line.alreadyReturnedQty
                        return (
                          <TableRow key={line.productId ?? line.productName}>
                            <TableCell className="font-medium">{line.productName}</TableCell>
                            <TableCell className="text-right">{line.invoicedQty}</TableCell>
                            <TableCell className="text-right">{line.alreadyReturnedQty}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                max={remaining}
                                value={line.returnQty}
                                onChange={(event) => updateLineQty(index, event.target.value)}
                                className="ml-auto w-24 bg-background text-right"
                              />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Company Profit (deducted)</p>
                    <p className="text-lg font-semibold text-destructive">-{formatAmount(previewTotals.companyProfit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Depot Profit (deducted)</p>
                    <p className="text-lg font-semibold text-destructive">-{formatAmount(previewTotals.depotProfit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Dealer Profit (deducted)</p>
                    <p className="text-lg font-semibold text-destructive">-{formatAmount(previewTotals.dealerProfit)}</p>
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
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
                Select an invoice above to load its line items.
              </div>
            )}

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

            <div className="flex justify-end gap-3 border-t border-border/60 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Record return'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
