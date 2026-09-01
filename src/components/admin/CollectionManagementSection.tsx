"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { HandCoins, Plus, Printer, Receipt as ReceiptIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { CollectionMethod, CollectionRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

function dateInputValue(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const methodLabel: Record<CollectionMethod, string> = { cash: 'Cash', bank: 'Bank', mfs: 'MFS' }
const methodTone: Record<CollectionMethod, string> = {
  cash: 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
  bank: 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300',
  mfs: 'border-violet-200 bg-violet-500/10 text-violet-700 dark:border-violet-900 dark:text-violet-300',
}

export function CollectionManagementSection() {
  const { data, recordCollection } = useERP()
  const currency = data?.settings.currency

  const dueOrders = useMemo(
    () =>
      toArray(data?.orders)
        .filter((order) => order.status !== 'cancelled' && order.due > 0)
        .sort((left, right) => right.due - left.due),
    [data?.orders]
  )
  const collections = useMemo(
    () => toArray(data?.collections).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.collections]
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [orderId, setOrderId] = useState('')
  const [amount, setAmount] = useState('0')
  const [method, setMethod] = useState<CollectionMethod>('cash')
  const [collectionDate, setCollectionDate] = useState(dateInputValue())
  const [feedback, setFeedback] = useState<string | null>(null)

  const orderOptions: ComboboxOption[] = useMemo(
    () =>
      dueOrders.map((order) => ({
        value: order.id,
        label: order.billNumber,
        sublabel: `${order.customerName} — due ${formatCurrency(order.due, currency)}`,
      })),
    [dueOrders, currency]
  )

  const selectedOrder = dueOrders.find((order) => order.id === orderId)

  function openDialog() {
    setFeedback(null)
    setOrderId('')
    setAmount('0')
    setMethod('cash')
    setCollectionDate(dateInputValue())
    setDialogOpen(true)
  }

  function selectOrder(id: string) {
    setOrderId(id)
    const order = dueOrders.find((entry) => entry.id === id)
    setAmount(order ? String(order.due) : '0')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    if (!orderId) {
      setFeedback('Select an invoice to collect against.')
      return
    }

    try {
      await recordCollection({ orderId, amount: Number(amount), method, collectionDate })
      setFeedback('Collection recorded — customer ledger and receipt updated.')
      setDialogOpen(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record collection.')
    }
  }

  function buildReceiptHtml(collection: CollectionRecord) {
    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt ${escapeHtml(collection.receiptNumber)}</title>
          <style>
            * { box-sizing: border-box; }
            @page { margin: 0; }
            body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 14mm 12mm 18mm; }
            .header { border-bottom: 2px solid #111827; display: flex; justify-content: space-between; padding-bottom: 18px; }
            h1 { font-size: 22px; margin: 0; }
            p { color: #4b5563; font-size: 13px; margin: 5px 0 0; }
            .title { font-size: 26px; font-weight: 700; text-align: right; text-transform: uppercase; }
            .box { border: 1px solid #d1d5db; border-radius: 8px; margin-top: 24px; padding: 16px; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; }
            .row.grand { border-top: 2px solid #111827; font-size: 18px; font-weight: 700; margin-top: 8px; }
            @media screen { body { padding: 32px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>${escapeHtml(data?.settings.companyName ?? 'ERP')}</h1>
              <p>Collection Receipt</p>
            </div>
            <div>
              <p class="title">Receipt</p>
              <p><strong>No:</strong> ${escapeHtml(collection.receiptNumber)}</p>
              <p><strong>Date:</strong> ${formatDate(collection.collectionDate)}</p>
            </div>
          </div>
          <div class="box">
            <div class="row"><span>Received from</span><strong>${escapeHtml(collection.customerName)}</strong></div>
            <div class="row"><span>Against invoice</span><strong>${escapeHtml(collection.billNumber)}</strong></div>
            <div class="row"><span>Payment method</span><strong>${methodLabel[collection.method]}</strong></div>
            <div class="row"><span>Collected by</span><strong>${escapeHtml(collection.collectedByName)}</strong></div>
            <div class="row grand"><span>Amount received</span><strong>${formatCurrency(collection.amount, currency)}</strong></div>
          </div>
          <script>
            window.addEventListener('load', () => { window.focus(); window.print(); });
          </script>
        </body>
      </html>
    `
  }

  function printReceipt(collection: CollectionRecord) {
    setFeedback(null)
    const popup = window.open('', '_blank', 'width=720,height=640')
    if (!popup) {
      setFeedback('Allow popups to print the receipt.')
      return
    }
    popup.document.open()
    popup.document.write(buildReceiptHtml(collection))
    popup.document.close()
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <HandCoins className="h-4.5 w-4.5" />
          </div>
          <div>
            <CardTitle>Collections</CardTitle>
            <CardDescription>Sales/Collection Officer entry against a specific due invoice — receipt and customer ledger update automatically.</CardDescription>
          </div>
        </div>
        <Button onClick={openDialog} className="h-10 rounded-xl" disabled={dueOrders.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          Record collection
        </Button>
      </CardHeader>
      <CardContent>
        {feedback ? <p className="mb-4 text-sm text-primary">{feedback}</p> : null}
        <div className="overflow-x-auto rounded-2xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Receipt</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Receipt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collections.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.receiptNumber}</TableCell>
                  <TableCell>{entry.billNumber}</TableCell>
                  <TableCell>{entry.customerName}</TableCell>
                  <TableCell>{formatCurrency(entry.amount, currency)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('rounded-full', methodTone[entry.method])}>
                      {methodLabel[entry.method]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(entry.collectionDate)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => printReceipt(entry)} aria-label={`Print receipt ${entry.receiptNumber}`}>
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {collections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                    No collections recorded yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record collection</DialogTitle>
            <DialogDescription>Pick the invoice this money is being collected against.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Invoice<span className="ml-0.5 text-rose-500">*</span></p>
              <Combobox
                options={orderOptions}
                value={orderId}
                onChange={selectOrder}
                placeholder="Select an outstanding invoice"
                searchPlaceholder="Search bill number or customer..."
              />
              {selectedOrder ? (
                <p className="text-xs text-muted-foreground">Outstanding due: {formatCurrency(selectedOrder.due, currency)}</p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Amount ({currency ?? 'BDT'})<span className="ml-0.5 text-rose-500">*</span></p>
                <Input
                  type="number"
                  min="1"
                  max={selectedOrder?.due ?? undefined}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Collection date</p>
                <Input type="date" value={collectionDate} onChange={(event) => setCollectionDate(event.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Cash / Bank / MFS</p>
              <Select value={method} onValueChange={(value) => setMethod(value as CollectionMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="mfs">MFS (bKash/Nagad/Rocket)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-xl" disabled={!orderId}>
                <ReceiptIcon className="mr-2 h-4 w-4" />
                Record &amp; generate receipt
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
