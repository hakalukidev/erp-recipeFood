"use client"

import { useEffect, useMemo, useState } from 'react'
import { Edit, Printer, Trash2 } from 'lucide-react'

import { RecordApprovalTag } from '@/components/admin/ApprovalStatusBadge'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
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
import type { PurchaseMaterialUnit, VendorPaymentRecord } from '@/lib/erp/types'
import { computeVendorDue, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

function formatAmount(value: number) {
  return value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Vendor-level payment (2026-09-28 client request) — pays down the vendor's
// whole running due rather than one purchase:
//   Previous Due + New Purchase − Payment = Current Due
// e.g. opening ৳3,00,000 + purchase ৳1,00,000 − payment ৳1,50,000 = ৳2,50,000.
// Pass `editingPayment` to correct an existing vendor-level payment instead.
export function VendorPaymentDialog({
  open,
  onOpenChange,
  vendorId: initialVendorId,
  editingPayment,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendorId?: string
  editingPayment?: VendorPaymentRecord | null
  onSaved?: (message: string) => void
}) {
  const { data, recordVendorPayment, updateVendorPayment } = useERP()
  const [vendorId, setVendorId] = useState('')
  const [amount, setAmount] = useState('0')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setVendorId(editingPayment?.vendorId ?? initialVendorId ?? '')
    setAmount(editingPayment ? String(editingPayment.amount) : '0')
    setDate(editingPayment?.date ?? new Date().toISOString().slice(0, 10))
    setNote(editingPayment?.note ?? '')
    setError(null)
  }, [open, editingPayment, initialVendorId])

  const vendorOptions: ComboboxOption[] = useMemo(
    () =>
      toArray(data?.vendors)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((vendor) => ({ value: vendor.id, label: vendor.name, sublabel: vendor.phone })),
    [data?.vendors]
  )

  // Due before this payment — when editing, the payment's own amount is
  // added back so the breakdown reads as if it hadn't been made yet.
  const previousDue = vendorId ? computeVendorDue(data ?? null, vendorId) + (editingPayment?.amount ?? 0) : 0
  const paymentAmount = Number(amount) || 0
  const currentDue = previousDue - paymentAmount

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      if (editingPayment) {
        await updateVendorPayment(editingPayment.id, { amount: paymentAmount, date, note: note.trim() || undefined })
        onSaved?.(`Payment ${editingPayment.receiptNumber} updated — ${formatAmount(currentDue)} still due.`)
      } else {
        await recordVendorPayment({ vendorId, amount: paymentAmount, date, note: note.trim() || undefined })
        const vendorName = data?.vendors[vendorId]?.name ?? 'vendor'
        onSaved?.(`Paid ${formatAmount(paymentAmount)} to ${vendorName} — ${formatAmount(currentDue)} still due.`)
      }
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingPayment ? `Edit payment ${editingPayment.receiptNumber}` : 'Pay vendor'}</DialogTitle>
          <DialogDescription>
            Pays down the vendor&apos;s total due — opening due plus every purchase — not just one purchase.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Vendor</p>
            <Combobox
              options={vendorOptions}
              value={vendorId}
              onChange={setVendorId}
              placeholder="Select vendor"
              searchPlaceholder="Search vendor..."
              emptyText="No matching vendor."
              disabled={Boolean(editingPayment)}
            />
          </div>

          <div className="grid gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Previous due</span>
              <span className="font-semibold tabular-nums">{formatAmount(previousDue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">− Payment</span>
              <span className="font-semibold tabular-nums text-emerald-600">{formatAmount(paymentAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-border/60 pt-2">
              <span className="font-medium">Current due</span>
              <span className={cn('font-semibold tabular-nums', currentDue > 0 ? 'text-destructive' : 'text-emerald-600')}>
                {formatAmount(currentDue)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Amount</p>
            <Input type="number" min={0} max={previousDue} value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Date</p>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Note (optional)</p>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Paid by bank transfer" />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" className="rounded-xl" disabled={!vendorId || saving} onClick={() => void handleSave()}>
              {saving ? 'Saving…' : editingPayment ? 'Save changes' : 'Record payment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatQty(value: number) {
  return value.toLocaleString('en-BD', { maximumFractionDigits: 2 })
}

const UNIT_LABEL: Record<PurchaseMaterialUnit, string> = { kg: 'Kg', pcs: 'Pcs' }

type LedgerRow = {
  key: string
  date: string
  createdAt: string
  transaction: string
  // e.g. "মরিচ 500 Kg @ 200" — one entry per purchase line
  details: string[]
  purchase: number
  payment: number
  // Only vendor-level payments are editable from the ledger — per-purchase
  // payments are edited from that purchase's Payment history.
  accountPayment?: VendorPaymentRecord
}

type ProductSummaryRow = { name: string; unit: PurchaseMaterialUnit; qty: number; amount: number }

// Vendor Statement / Ledger (2026-09-28 client spec): every transaction
// with a vendor in date order —
//   Previous Due → Purchase (+) → Payment (−) → running Due
// plus product-wise quantity bought. An optional From/To range rolls
// everything before `from` into the Previous Due row, like a bank
// statement. The closing balance (with no range) equals computeVendorDue.
export function VendorLedgerDialog({
  open,
  onOpenChange,
  vendorId,
  onFeedback,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendorId: string | null
  onFeedback?: (message: string) => void
}) {
  const { data, deleteVendorPayment } = useERP()
  const [editingPayment, setEditingPayment] = useState<VendorPaymentRecord | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const vendor = vendorId ? data?.vendors[vendorId] : undefined

  useEffect(() => {
    if (open) {
      setFromDate('')
      setToDate('')
    }
  }, [open, vendorId])

  const vendorPurchases = useMemo(
    () => toArray(data?.purchases).filter((purchase) => purchase.vendorId === vendorId),
    [data?.purchases, vendorId]
  )

  const allRows = useMemo(() => {
    if (!vendorId) return []
    const list: LedgerRow[] = []
    vendorPurchases.forEach((purchase) => {
      list.push({
        key: purchase.id,
        date: purchase.date,
        createdAt: purchase.createdAt,
        transaction: `Purchase ${purchase.purchaseNumber}${purchase.updatedAt ? ` (edited ${formatDate(purchase.updatedAt)})` : ''}`,
        details: purchase.items.map(
          (item) => `${item.materialName} ${formatQty(item.qty)} ${UNIT_LABEL[item.unit]} @ ${formatAmount(item.rate)}`
        ),
        purchase: purchase.totalAmount,
        payment: 0,
      })
      const separatePayments = toArray(data?.vendorPayments)
        .filter((payment) => payment.purchaseId === purchase.id)
        .reduce((sum, payment) => sum + payment.amount, 0)
      const paidAtPurchase = purchase.paid - separatePayments
      if (paidAtPurchase !== 0) {
        list.push({
          key: `${purchase.id}-paid`,
          date: purchase.date,
          createdAt: purchase.createdAt,
          transaction: 'Payment',
          details: [`Paid with ${purchase.purchaseNumber}`],
          purchase: 0,
          payment: paidAtPurchase,
        })
      }
    })
    toArray(data?.vendorPayments)
      .filter((payment) => payment.vendorId === vendorId)
      .forEach((payment) => {
        list.push({
          key: payment.id,
          date: payment.date,
          createdAt: payment.createdAt,
          transaction: `Payment ${payment.receiptNumber}`,
          details: [
            payment.purchaseNumber ? `Against ${payment.purchaseNumber}` : 'Against total due',
            ...(payment.note ? [payment.note] : []),
          ],
          purchase: 0,
          payment: payment.amount,
          ...(payment.purchaseId ? {} : { accountPayment: payment }),
        })
      })
    return list.sort((left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt))
  }, [data?.vendorPayments, vendorPurchases, vendorId])

  const statement = useMemo(() => {
    const openingDue = vendor?.openingDue ?? 0
    const before = fromDate ? allRows.filter((row) => row.date < fromDate) : []
    const inRange = allRows.filter((row) => (!fromDate || row.date >= fromDate) && (!toDate || row.date <= toDate))
    const previousDue = before.reduce((sum, row) => sum + row.purchase - row.payment, openingDue)
    let running = previousDue
    const rows = inRange.map((row) => {
      running += row.purchase - row.payment
      return { ...row, balance: running }
    })
    const totalPurchase = inRange.reduce((sum, row) => sum + row.purchase, 0)
    const totalPayment = inRange.reduce((sum, row) => sum + row.payment, 0)

    const productMap = new Map<string, ProductSummaryRow>()
    vendorPurchases
      .filter((purchase) => (!fromDate || purchase.date >= fromDate) && (!toDate || purchase.date <= toDate))
      .forEach((purchase) =>
        purchase.items.forEach((item) => {
          const key = `${item.materialId ?? item.materialName}|${item.unit}`
          const existing = productMap.get(key)
          if (existing) {
            existing.qty += item.qty
            existing.amount += item.amount
          } else {
            productMap.set(key, { name: item.materialName, unit: item.unit, qty: item.qty, amount: item.amount })
          }
        })
      )
    const products = Array.from(productMap.values()).sort((left, right) => right.amount - left.amount)

    return { previousDue, rows, totalPurchase, totalPayment, currentDue: previousDue + totalPurchase - totalPayment, products }
  }, [allRows, vendorPurchases, vendor?.openingDue, fromDate, toDate])

  const previousLabel = fromDate ? `Previous due (before ${formatDate(fromDate)})` : 'Previous due (opening)'

  const exportHeaders = ['Date', 'Transaction', 'Details', 'Purchase', 'Payment', 'Due']
  const exportRows = useMemo(
    () => [
      ['Previous', previousLabel, '', '', '', statement.previousDue.toFixed(2)],
      ...statement.rows.map((row) => [
        formatDate(row.date),
        row.transaction,
        row.details.join('; '),
        row.purchase ? row.purchase.toFixed(2) : '',
        row.payment ? row.payment.toFixed(2) : '',
        row.balance.toFixed(2),
      ]),
      ['', 'Total', '', statement.totalPurchase.toFixed(2), statement.totalPayment.toFixed(2), statement.currentDue.toFixed(2)],
    ],
    [statement, previousLabel]
  )

  function handlePrint() {
    if (!vendor) return
    const rangeLabel =
      fromDate || toDate ? `${fromDate ? formatDate(fromDate) : 'Start'} — ${toDate ? formatDate(toDate) : 'Today'}` : 'All transactions'
    const ledgerRows = statement.rows
      .map(
        (row) => `
        <tr>
          <td>${escapeHtml(formatDate(row.date))}</td>
          <td>${escapeHtml(row.transaction)}<div class="muted">${row.details.map(escapeHtml).join('<br/>')}</div></td>
          <td class="numeric">${row.purchase ? formatAmount(row.purchase) : '—'}</td>
          <td class="numeric">${row.payment ? formatAmount(row.payment) : '—'}</td>
          <td class="numeric">${formatAmount(row.balance)}</td>
        </tr>`
      )
      .join('')
    const productRows = statement.products
      .map(
        (product, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(product.name)}</td>
          <td class="numeric">${formatQty(product.qty)} ${UNIT_LABEL[product.unit]}</td>
          <td class="numeric">${formatAmount(product.amount)}</td>
        </tr>`
      )
      .join('')
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Vendor Statement — ${escapeHtml(vendor.name)}</title>
    <style>
      @page { margin: 12mm 16mm; size: A4; }
      body { color: #111827; font-family: Arial, sans-serif; margin: 0; }
      .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #0f766e; }
      .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
      .subtitle { text-align: center; color: #4b5563; font-size: 13px; margin: 10px 0 16px; }
      .meta { border-collapse: collapse; margin-bottom: 16px; width: 60%; }
      .meta td { border: 1px solid #d1d5db; padding: 4px 8px; font-size: 13px; }
      .meta td:first-child { font-weight: 600; width: 45%; }
      .hl { background: #ccfbf1; font-weight: 700; }
      table.doc { border-collapse: collapse; width: 100%; }
      table.doc th, table.doc td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 12.5px; vertical-align: top; }
      table.doc th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
      .numeric { text-align: right; white-space: nowrap; }
      .muted { color: #6b7280; font-size: 11.5px; }
      tr.totals td { font-weight: 700; border-top: 2px solid #111827; }
      .section-heading { font-size: 13px; font-weight: 700; margin: 16px 0 6px; }
      .footnote { text-align: center; font-style: italic; font-size: 11.5px; color: #4b5563; margin-top: 16px; }
    </style>
  </head>
  <body>
    <p class="title">${escapeHtml(COMPANY_NAME)}</p>
    <p class="company-meta">${escapeHtml(COMPANY_ADDRESS)}</p>
    <p class="company-meta">${escapeHtml(COMPANY_EMAIL)} &middot; Help Line: ${escapeHtml(COMPANY_HELPLINE)}</p>
    <p class="subtitle">Vendor Statement / Ledger — ${escapeHtml(rangeLabel)}</p>
    <table class="meta">
      <tr><td>Vendor:</td><td>${escapeHtml(vendor.name)}</td></tr>
      ${vendor.proprietorName ? `<tr><td>Proprietor:</td><td>${escapeHtml(vendor.proprietorName)}</td></tr>` : ''}
      ${vendor.address ? `<tr><td>Address:</td><td>${escapeHtml(vendor.address)}</td></tr>` : ''}
      ${vendor.phone ? `<tr><td>Mobile:</td><td>${escapeHtml(vendor.phone)}</td></tr>` : ''}
      <tr><td>Previous Due:</td><td class="numeric">${formatAmount(statement.previousDue)}</td></tr>
      <tr><td>Total Purchase:</td><td class="numeric">${formatAmount(statement.totalPurchase)}</td></tr>
      <tr><td>Total Payment:</td><td class="numeric">${formatAmount(statement.totalPayment)}</td></tr>
      <tr><td>Current Due:</td><td class="numeric hl">${formatAmount(statement.currentDue)}</td></tr>
    </table>
    <table class="doc">
      <thead><tr><th>Date</th><th>Transaction</th><th>Purchase</th><th>Payment</th><th>Due</th></tr></thead>
      <tbody>
        <tr><td>Previous</td><td>${escapeHtml(previousLabel)}</td><td class="numeric">—</td><td class="numeric">—</td><td class="numeric">${formatAmount(statement.previousDue)}</td></tr>
        ${ledgerRows}
      </tbody>
      <tr class="totals"><td colspan="2">Total</td><td class="numeric">${formatAmount(statement.totalPurchase)}</td><td class="numeric">${formatAmount(statement.totalPayment)}</td><td class="numeric">${formatAmount(statement.currentDue)}</td></tr>
    </table>
    ${
      statement.products.length
        ? `<p class="section-heading">Product-wise Purchase</p>
    <table class="doc">
      <thead><tr><th>SL</th><th>Product</th><th>Quantity</th><th>Amount</th></tr></thead>
      <tbody>${productRows}</tbody>
      <tr class="totals"><td colspan="3">Total</td><td class="numeric">${formatAmount(statement.totalPurchase)}</td></tr>
    </table>`
        : ''
    }
    <p class="footnote">${escapeHtml(COMPANY_INVOICE_FOOTER_NOTE)}</p>
    <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
  </body>
</html>`
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
  }

  async function handleDelete(payment: VendorPaymentRecord) {
    if (!window.confirm(`Delete payment ${payment.receiptNumber} of ${formatAmount(payment.amount)}?`)) return
    try {
      await deleteVendorPayment(payment.id)
      onFeedback?.(`Payment ${payment.receiptNumber} deleted.`)
    } catch (reason) {
      onFeedback?.(reason instanceof Error ? reason.message : 'Unable to delete payment.')
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vendor statement — {vendor?.name ?? ''}</DialogTitle>
            <DialogDescription>
              Previous Due + Purchase − Payment = Current Due
              {vendor?.phone ? ` · ${vendor.phone}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">From</p>
              <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-9 w-40" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">To</p>
              <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-9 w-40" />
            </div>
            {fromDate || toDate ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => {
                  setFromDate('')
                  setToDate('')
                }}
              >
                Clear
              </Button>
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" className="h-9 rounded-xl" onClick={handlePrint} disabled={!vendor}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
              <ExportMenu
                filenameBase={`vendor-statement-${vendor?.name ?? 'vendor'}`}
                title={`Vendor Statement — ${vendor?.name ?? ''}`}
                headers={exportHeaders}
                rows={exportRows}
              />
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Previous due</p>
              <p className="font-semibold tabular-nums">{formatAmount(statement.previousDue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">+ Total purchase</p>
              <p className="font-semibold tabular-nums">{formatAmount(statement.totalPurchase)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">− Total payment</p>
              <p className="font-semibold tabular-nums text-emerald-600">{formatAmount(statement.totalPayment)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">= Current due</p>
              <p className={cn('font-semibold tabular-nums', statement.currentDue > 0 ? 'text-destructive' : 'text-emerald-600')}>
                {formatAmount(statement.currentDue)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Date</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead className="text-right">Purchase (+)</TableHead>
                  <TableHead className="text-right">Payment (−)</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/20">
                  <TableCell>Previous</TableCell>
                  <TableCell className="font-medium">{previousLabel}</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatAmount(statement.previousDue)}</TableCell>
                  <TableCell />
                </TableRow>
                {statement.rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="whitespace-nowrap align-top">{formatDate(row.date)}</TableCell>
                    <TableCell className="min-w-56 align-top">
                      <p className="font-medium">
                        {row.transaction}
                        {row.accountPayment ? <RecordApprovalTag record={row.accountPayment} /> : null}
                      </p>
                      {row.details.map((detail, index) => (
                        <p key={index} className="text-xs text-muted-foreground">
                          {detail}
                        </p>
                      ))}
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">{row.purchase ? formatAmount(row.purchase) : '—'}</TableCell>
                    <TableCell className="text-right align-top tabular-nums text-emerald-600">
                      {row.payment ? formatAmount(row.payment) : '—'}
                    </TableCell>
                    <TableCell className="text-right align-top font-semibold tabular-nums">{formatAmount(row.balance)}</TableCell>
                    <TableCell className="text-right align-top">
                      {row.accountPayment ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Edit payment"
                            onClick={() => {
                              setEditingPayment(row.accountPayment ?? null)
                              setEditDialogOpen(true)
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label="Delete payment"
                            onClick={() => row.accountPayment && void handleDelete(row.accountPayment)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {statement.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                      No purchases or payments in this period.
                    </TableCell>
                  </TableRow>
                ) : null}
                <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(statement.totalPurchase)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600">{formatAmount(statement.totalPayment)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(statement.currentDue)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Product-wise purchase</p>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Avg. rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statement.products.map((product) => (
                    <TableRow key={`${product.name}|${product.unit}`}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQty(product.qty)} {UNIT_LABEL[product.unit]}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {product.qty ? formatAmount(product.amount / product.qty) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(product.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {statement.products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                        No products purchased in this period.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <VendorPaymentDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editingPayment={editingPayment}
        onSaved={onFeedback}
      />
    </>
  )
}
