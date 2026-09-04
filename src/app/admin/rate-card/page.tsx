"use client"

import { useMemo, useState } from 'react'
import { Calculator, Plus, Printer, Search, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useERP } from '@/lib/erp/provider'
import type { RateCardLineItem, RateCardRecord, RateCardVoucherType } from '@/lib/erp/types'
import { createId, formatDate, sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'

// Which per-unit/line-total rate columns each voucher type is allowed to
// print, and whether the margin (Usable money / Usable u Depot) box shows.
// Depot and Dealer vouchers never see the margin box or a rate stage past
// their own purchase price — see the confirmed requirement this mirrors.
const RATE_CARD_VOUCHER_COLUMNS: Record<
  RateCardVoucherType,
  { columns: Array<'raw' | 'manuf' | 'depot' | 'dealer'>; showSummary: boolean; label: string }
> = {
  company: { columns: ['raw', 'manuf', 'depot', 'dealer'], showSummary: true, label: 'Company (internal)' },
  depot: { columns: ['manuf', 'depot'], showSummary: false, label: 'Depot' },
  dealer: { columns: ['depot', 'dealer'], showSummary: false, label: 'Dealer' },
}

const RATE_COLUMN_LABELS: Record<'raw' | 'manuf' | 'depot' | 'dealer', { unit: string; total: string }> = {
  raw: { unit: 'Raw M', total: 'Raw Rate' },
  manuf: { unit: 'Mnu Ra', total: 'Manuf Rate' },
  depot: { unit: 'Dep Rate', total: 'Depot Rate' },
  dealer: { unit: 'Del Rate', total: 'Delar Rate' },
}

type LineItemForm = {
  key: string
  productName: string
  qty: string
  rawRate: string
  manufRate: string
  depotRate: string
  dealerRate: string
  perCtnBgs: string
}

function emptyLineItem(): LineItemForm {
  return {
    key: createId('line'),
    productName: '',
    qty: '1',
    rawRate: '0',
    manufRate: '0',
    depotRate: '0',
    dealerRate: '0',
    perCtnBgs: '',
  }
}

type RateCardForm = {
  invoiceNo: string
  voucherType: RateCardVoucherType
  recipientName: string
  date: string
  remarks: string
  items: LineItemForm[]
}

function emptyRateCardForm(): RateCardForm {
  return {
    invoiceNo: '',
    voucherType: 'company',
    recipientName: '',
    date: new Date().toISOString().slice(0, 10),
    remarks: '',
    items: [emptyLineItem()],
  }
}

function toLineItemForm(item: RateCardLineItem): LineItemForm {
  return {
    key: createId('line'),
    productName: item.productName,
    qty: String(item.qty),
    rawRate: String(item.rawRate),
    manufRate: String(item.manufRate),
    depotRate: String(item.depotRate),
    dealerRate: String(item.dealerRate),
    perCtnBgs: item.perCtnBgs ?? '',
  }
}

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

// Same cascade math as computeRateCardTotals in provider.tsx — kept in sync
// by hand since this is a live preview over uncommitted form state, not a
// saved record.
function computeTotals(items: LineItemForm[]) {
  const parsed = items.map((item) => ({
    qty: Number(item.qty) || 0,
    rawRate: Number(item.rawRate) || 0,
    manufRate: Number(item.manufRate) || 0,
    depotRate: Number(item.depotRate) || 0,
    dealerRate: Number(item.dealerRate) || 0,
  }))
  const rawRateTotal = parsed.reduce((sum, item) => sum + item.qty * item.rawRate, 0)
  const manufRateTotal = parsed.reduce((sum, item) => sum + item.qty * item.manufRate, 0)
  const depotRateTotal = parsed.reduce((sum, item) => sum + item.qty * item.depotRate, 0)
  const dealerRateTotal = parsed.reduce((sum, item) => sum + item.qty * item.dealerRate, 0)
  const pouchCartonAmount = manufRateTotal - rawRateTotal
  const usableMoney = depotRateTotal - manufRateTotal
  const usableUDepot = dealerRateTotal - manufRateTotal

  return {
    rawRateTotal,
    manufRateTotal,
    depotRateTotal,
    dealerRateTotal,
    pouchCartonAmount,
    usableMoney,
    usableMoneyPercent: dealerRateTotal ? (usableMoney / dealerRateTotal) * 100 : 0,
    usableUDepot,
    usableUDepotPercent: dealerRateTotal ? (usableUDepot / dealerRateTotal) * 100 : 0,
  }
}

function buildRateCardHtml(rateCard: RateCardRecord) {
  const config = RATE_CARD_VOUCHER_COLUMNS[rateCard.voucherType]
  const columns = config.columns

  const summaryRows = config.showSummary
    ? `
      <tr><td>Manu F Rate:</td><td class="numeric">${formatAmount(rateCard.manufRateTotal)}</td><td></td></tr>
      <tr><td>Raw Rate:</td><td class="numeric">${formatAmount(rateCard.rawRateTotal)}</td><td></td></tr>
      <tr><td>Depot Sales Rate:</td><td class="numeric">${formatAmount(rateCard.depotRateTotal)}</td><td></td></tr>
      <tr><td>Dealer Sales Rate:</td><td class="numeric">${formatAmount(rateCard.dealerRateTotal)}</td><td></td></tr>
      <tr><td>Usable money:</td><td class="numeric hl">${formatAmount(rateCard.usableMoney)}</td><td class="numeric hl">${rateCard.usableMoneyPercent.toFixed(2)}%</td></tr>
      <tr><td>Usable u Depot:</td><td class="numeric hl">${rateCard.usableUDepotPercent.toFixed(2)}%</td><td class="numeric hl">${formatAmount(rateCard.usableUDepot)}</td></tr>
      <tr><td>Pouch Cart Am:</td><td class="numeric hl" colspan="2">${formatAmount(rateCard.pouchCartonAmount)}</td></tr>
    `
    : `
      <tr><td>${RATE_COLUMN_LABELS[columns[0]].total}:</td><td class="numeric" colspan="2">${formatAmount(
        columns[0] === 'raw'
          ? rateCard.rawRateTotal
          : columns[0] === 'manuf'
            ? rateCard.manufRateTotal
            : columns[0] === 'depot'
              ? rateCard.depotRateTotal
              : rateCard.dealerRateTotal
      )}</td></tr>
      <tr><td>${RATE_COLUMN_LABELS[columns[1]].total}:</td><td class="numeric" colspan="2">${formatAmount(
        columns[1] === 'raw'
          ? rateCard.rawRateTotal
          : columns[1] === 'manuf'
            ? rateCard.manufRateTotal
            : columns[1] === 'depot'
              ? rateCard.depotRateTotal
              : rateCard.dealerRateTotal
      )}</td></tr>
    `

  const rateValue = (item: RateCardLineItem, column: 'raw' | 'manuf' | 'depot' | 'dealer') =>
    column === 'raw' ? item.rawRate : column === 'manuf' ? item.manufRate : column === 'depot' ? item.depotRate : item.dealerRate

  const rows = rateCard.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td class="numeric">${item.qty}</td>
        ${columns.map((column) => `<td class="numeric">${formatAmount(rateValue(item, column))}</td>`).join('')}
        <td>${escapeHtml(item.perCtnBgs ?? '')}</td>
        ${columns.map((column) => `<td class="numeric">${formatAmount(item.qty * rateValue(item, column))}</td>`).join('')}
      </tr>
    `
    )
    .join('')

  const totalsRow = `
    <tr class="totals">
      <td colspan="3"></td>
      <td colspan="${columns.length}"></td>
      <td></td>
      ${columns
        .map((column) =>
          `<td class="numeric">${formatAmount(
            column === 'raw'
              ? rateCard.rawRateTotal
              : column === 'manuf'
                ? rateCard.manufRateTotal
                : column === 'depot'
                  ? rateCard.depotRateTotal
                  : rateCard.dealerRateTotal
          )}</td>`
        )
        .join('')}
    </tr>
  `

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(config.label)} Voucher ${escapeHtml(rateCard.invoiceNo)}</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 12mm 16mm; size: A4; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
          .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; }
          .subtitle { text-align: center; color: #4b5563; font-size: 13px; margin: 0 0 16px; }
          .meta { border: 1px solid #d1d5db; border-collapse: collapse; margin-bottom: 16px; width: 60%; }
          .meta td { border: 1px solid #d1d5db; padding: 4px 8px; font-size: 13px; }
          .meta td:first-child { font-weight: 600; width: 55%; }
          .hl { background: #fef9c3; font-weight: 700; }
          table.doc { border-collapse: collapse; width: 100%; }
          table.doc th, table.doc td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 12.5px; }
          table.doc th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
          .numeric { text-align: right; white-space: nowrap; }
          tr.totals td { font-weight: 700; border-top: 2px solid #111827; }
          .remarks { margin-top: 16px; font-size: 12.5px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <p class="title">Recipe Food Products Limited</p>
        <p class="subtitle">${escapeHtml(config.label)} Voucher</p>
        <table class="meta">
          <tr><td>Recipient Name:</td><td>${escapeHtml(rateCard.recipientName)}</td></tr>
          <tr><td>Invoice No:</td><td>${escapeHtml(rateCard.invoiceNo)}</td></tr>
          <tr><td>Date:</td><td>${escapeHtml(rateCard.date)}</td></tr>
          ${summaryRows}
        </table>
        <table class="doc">
          <thead>
            <tr>
              <th>SL</th>
              <th>Description of Products</th>
              <th>QTY</th>
              ${columns.map((column) => `<th>${RATE_COLUMN_LABELS[column].unit}</th>`).join('')}
              <th>Per Ctn/Bgs</th>
              ${columns.map((column) => `<th>${RATE_COLUMN_LABELS[column].total}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}${totalsRow}</tbody>
        </table>
        ${rateCard.remarks ? `<p class="remarks"><strong>মন্তব্য:</strong> ${escapeHtml(rateCard.remarks)}</p>` : ''}
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

export default function RateCardPage() {
  const { data, saveRateCard, deleteRateCard } = useERP()
  const rateCards = useMemo(() => sortByCreatedAtDesc(toArray(data?.rateCards)), [data?.rateCards])
  const products = useMemo(() => toArray(data?.products), [data?.products])

  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RateCardForm>(emptyRateCardForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const filteredRateCards = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return rateCards
    return rateCards.filter((card) =>
      [card.invoiceNo, card.recipientName, card.voucherType].join(' ').toLowerCase().includes(normalized)
    )
  }, [rateCards, query])

  const totals = useMemo(() => computeTotals(form.items), [form.items])

  function openCreateDialog() {
    setEditingId(null)
    setForm(emptyRateCardForm())
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(card: RateCardRecord) {
    setEditingId(card.id)
    setForm({
      invoiceNo: card.invoiceNo,
      voucherType: card.voucherType,
      recipientName: card.recipientName,
      date: card.date,
      remarks: card.remarks ?? '',
      items: card.items.map(toLineItemForm),
    })
    setFormError(null)
    setDialogOpen(true)
  }

  function updateItem(key: string, patch: Partial<LineItemForm>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }))
  }

  function addItem() {
    setForm((current) => ({ ...current, items: [...current.items, emptyLineItem()] }))
  }

  function removeItem(key: string) {
    setForm((current) => ({ ...current, items: current.items.filter((item) => item.key !== key) }))
  }

  async function handleSave() {
    setFormError(null)

    if (!form.invoiceNo.trim()) {
      setFormError('Invoice number is required.')
      return
    }
    if (!form.recipientName.trim()) {
      setFormError('Recipient name is required.')
      return
    }

    const items: RateCardLineItem[] = form.items
      .filter((item) => item.productName.trim())
      .map((item) => ({
        productName: item.productName.trim(),
        qty: Number(item.qty) || 0,
        rawRate: Number(item.rawRate) || 0,
        manufRate: Number(item.manufRate) || 0,
        depotRate: Number(item.depotRate) || 0,
        dealerRate: Number(item.dealerRate) || 0,
        perCtnBgs: item.perCtnBgs.trim() || undefined,
      }))

    if (items.length === 0) {
      setFormError('Add at least one product line.')
      return
    }

    setSaving(true)
    try {
      await saveRateCard(
        {
          invoiceNo: form.invoiceNo.trim(),
          voucherType: form.voucherType,
          recipientName: form.recipientName.trim(),
          date: form.date,
          remarks: form.remarks.trim() || undefined,
          items,
        },
        editingId ?? undefined
      )
      setDialogOpen(false)
      setFeedback(editingId ? 'Rate card updated.' : 'Rate card created.')
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Unable to save rate card.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(card: RateCardRecord) {
    setFeedback(null)
    try {
      await deleteRateCard(card.id)
      setFeedback(`Deleted rate card ${card.invoiceNo}.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete rate card.')
    }
  }

  function handlePrint(card: RateCardRecord) {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(buildRateCardHtml(card))
    printWindow.document.close()
  }

  return (
    <AdminShell active="Rate Card / Costing">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Rate cards</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{rateCards.length.toLocaleString('en-BD')}</p>
              <p className="mt-1 text-xs text-muted-foreground">Company / Depot / Dealer rate sheets</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total dealer sales value</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {formatAmount(rateCards.reduce((sum, card) => sum + card.dealerRateTotal, 0))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Across all saved rate cards</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total usable money</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {formatAmount(rateCards.reduce((sum, card) => sum + card.usableMoney, 0))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Depot-stage margin, all cards</p>
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
              <CardTitle>Rate Card / Costing Sheet</CardTitle>
              <CardDescription>
                Raw material → manufacturing → depot → dealer rate cascade per product, with profit margins and
                Company/Depot/Dealer vouchers.
              </CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search invoice no or recipient"
                />
              </div>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                New Rate Card
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Voucher</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Dealer Rate Total</TableHead>
                    <TableHead className="text-right">Usable %</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRateCards.map((card) => (
                    <TableRow key={card.id}>
                      <TableCell className="font-medium">{card.invoiceNo}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {card.voucherType}
                        </Badge>
                      </TableCell>
                      <TableCell>{card.recipientName}</TableCell>
                      <TableCell>{formatDate(card.date)}</TableCell>
                      <TableCell className="text-right">{formatAmount(card.dealerRateTotal)}</TableCell>
                      <TableCell className="text-right">{card.usableMoneyPercent.toFixed(2)}%</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(card)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePrint(card)}>
                              <Printer className="mr-2 h-4 w-4" /> Print voucher
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(card)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRateCards.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        <Calculator className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        No rate cards yet. Create one to build a Company/Depot/Dealer voucher.
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
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-5xl overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit rate card' : 'New rate card'}</DialogTitle>
            <DialogDescription>
              Enter the Raw/Manuf/Depot/Dealer rate for each product — totals, Pouch Carton amount and Usable
              money/% are calculated automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Invoice No</label>
                <Input
                  value={form.invoiceNo}
                  onChange={(event) => setForm((current) => ({ ...current, invoiceNo: event.target.value }))}
                  placeholder="M-001/09"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Voucher type</label>
                <Select
                  value={form.voucherType}
                  onValueChange={(value: RateCardVoucherType) => setForm((current) => ({ ...current, voucherType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company (internal — full detail)</SelectItem>
                    <SelectItem value="depot">Depot voucher</SelectItem>
                    <SelectItem value="dealer">Dealer voucher</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Recipient name</label>
                <Input
                  value={form.recipientName}
                  onChange={(event) => setForm((current) => ({ ...current, recipientName: event.target.value }))}
                  placeholder="Dealer / Depot name"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                />
              </div>
            </div>

            <datalist id="rate-card-product-names">
              {products.map((product) => (
                <option key={product.id} value={product.name} />
              ))}
            </datalist>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description of Products</TableHead>
                    <TableHead className="w-20">QTY</TableHead>
                    <TableHead className="w-28">Raw M</TableHead>
                    <TableHead className="w-28">Mnu Ra</TableHead>
                    <TableHead className="w-28">Dep Rate</TableHead>
                    <TableHead className="w-28">Del Rate</TableHead>
                    <TableHead className="w-32">Per Ctn/Bgs</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.items.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell>
                        <Input
                          list="rate-card-product-names"
                          value={item.productName}
                          onChange={(event) => updateItem(item.key, { productName: event.target.value })}
                          placeholder="Product name"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.qty}
                          onChange={(event) => updateItem(item.key, { qty: event.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.rawRate}
                          onChange={(event) => updateItem(item.key, { rawRate: event.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.manufRate}
                          onChange={(event) => updateItem(item.key, { manufRate: event.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.depotRate}
                          onChange={(event) => updateItem(item.key, { depotRate: event.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.dealerRate}
                          onChange={(event) => updateItem(item.key, { dealerRate: event.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.perCtnBgs}
                          onChange={(event) => updateItem(item.key, { perCtnBgs: event.target.value })}
                          placeholder="500 ps = 1 bg"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.key)}
                          disabled={form.items.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="mr-2 h-4 w-4" /> Add product line
            </Button>

            <Card className="border-dashed">
              <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Raw Rate total</p>
                  <p className="font-semibold">{formatAmount(totals.rawRateTotal)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Manuf Rate total</p>
                  <p className="font-semibold">{formatAmount(totals.manufRateTotal)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Depot Rate total</p>
                  <p className="font-semibold">{formatAmount(totals.depotRateTotal)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dealer Rate total</p>
                  <p className="font-semibold">{formatAmount(totals.dealerRateTotal)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pouch/Carton amount</p>
                  <p className="font-semibold">{formatAmount(totals.pouchCartonAmount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Usable money (÷ Depot)</p>
                  <p className="font-semibold text-primary">
                    {formatAmount(totals.usableMoney)} · {totals.usableMoneyPercent.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Usable u Depot</p>
                  <p className="font-semibold text-primary">
                    {formatAmount(totals.usableUDepot)} · {totals.usableUDepotPercent.toFixed(2)}%
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">মন্তব্য / Remarks</label>
              <Textarea
                value={form.remarks}
                onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
                rows={2}
              />
            </div>

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create rate card'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
