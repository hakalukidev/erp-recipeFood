"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { PackageX, Plus, Undo2 } from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { SalesReturnCondition } from '@/lib/erp/types'
import { formatCurrency, formatDate, toArray } from '@/lib/erp/utils'

type ReturnLineState = { productId: string; productName: string; maxQty: number; quantity: string; condition: SalesReturnCondition }

export function SalesReturnSection() {
  const { data, createSalesReturn } = useERP()
  const orders = useMemo(
    () => toArray(data?.orders).filter((order) => order.status !== 'cancelled'),
    [data?.orders]
  )
  const salesReturns = useMemo(
    () => toArray(data?.salesReturns).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.salesReturns]
  )
  const currency = data?.settings.currency

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [lines, setLines] = useState<ReturnLineState[]>([])
  const [inspectionNote, setInspectionNote] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const orderOptions: ComboboxOption[] = useMemo(
    () => orders.map((order) => ({ value: order.id, label: order.billNumber, sublabel: order.customerName })),
    [orders]
  )

  function alreadyReturnedFor(orderId: string, productId: string) {
    return salesReturns
      .filter((entry) => entry.orderId === orderId)
      .flatMap((entry) => entry.items)
      .filter((item) => item.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0)
  }

  function openDialog() {
    setFeedback(null)
    setSelectedOrderId('')
    setLines([])
    setInspectionNote('')
    setDialogOpen(true)
  }

  function selectOrder(orderId: string) {
    setSelectedOrderId(orderId)
    const order = orders.find((entry) => entry.id === orderId)
    if (!order) {
      setLines([])
      return
    }

    setLines(
      order.items
        .map((item) => {
          const maxQty = item.quantity - alreadyReturnedFor(order.id, item.productId)
          return { productId: item.productId, productName: item.productName, maxQty, quantity: '0', condition: 'good' as SalesReturnCondition }
        })
        .filter((line) => line.maxQty > 0)
    )
  }

  const previewRefund = lines.reduce((sum, line) => {
    const order = orders.find((entry) => entry.id === selectedOrderId)
    const orderItem = order?.items.find((item) => item.productId === line.productId)
    const qty = Number(line.quantity || 0)
    return sum + (orderItem ? orderItem.unitPrice * qty : 0)
  }, 0)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const items = lines
      .filter((line) => Number(line.quantity || 0) > 0)
      .map((line) => ({ productId: line.productId, quantity: Number(line.quantity), condition: line.condition }))

    if (!selectedOrderId || items.length === 0) {
      setFeedback('Select an order and at least one product quantity to return.')
      return
    }

    try {
      const returnId = await createSalesReturn({ orderId: selectedOrderId, items, inspectionNote })
      setFeedback(`Return recorded (${returnId}). Stock and customer ledger updated automatically.`)
      setDialogOpen(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record sales return.')
    }
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
            <Undo2 className="h-4.5 w-4.5" />
          </div>
          <div>
            <CardTitle>Sales returns</CardTitle>
            <CardDescription>
              Return Inspection → Good/Bad Classification → Warehouse Update → Customer Ledger → Accounting — all in one entry.
            </CardDescription>
          </div>
        </div>
        <Button onClick={openDialog} className="h-10 rounded-xl">
          <Plus className="mr-2 h-4 w-4" />
          Record return
        </Button>
      </CardHeader>
      <CardContent>
        {feedback ? <p className="mb-4 text-sm text-primary">{feedback}</p> : null}
        <div className="overflow-x-auto rounded-2xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Return</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Refund</TableHead>
                <TableHead>Stock outcome</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesReturns.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.returnNumber}</TableCell>
                  <TableCell>{entry.billNumber}</TableCell>
                  <TableCell>{entry.customerName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.items.map((item) => `${item.productName} x${item.quantity}`).join(', ')}
                  </TableCell>
                  <TableCell>{formatCurrency(entry.totalRefund, currency)}</TableCell>
                  <TableCell className="space-x-1.5">
                    {entry.restockedQty > 0 ? (
                      <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">
                        {entry.restockedQty} restocked
                      </Badge>
                    ) : null}
                    {entry.writtenOffQty > 0 ? (
                      <Badge variant="outline" className="rounded-full border-rose-500/40 text-rose-600 dark:text-rose-400">
                        <PackageX className="mr-1 h-3 w-3" />
                        {entry.writtenOffQty} written off
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(entry.createdAt)}</TableCell>
                </TableRow>
              ))}
              {salesReturns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                    No sales returns recorded yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record sales return</DialogTitle>
            <DialogDescription>
              Mark each returned line "Good" to put it back on the shelf, or "Damaged" to write it off — the customer is refunded either way.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Order<span className="ml-0.5 text-rose-500">*</span></p>
              <Combobox
                options={orderOptions}
                value={selectedOrderId}
                onChange={selectOrder}
                placeholder="Select the original sales order"
                searchPlaceholder="Search bill number or customer..."
              />
            </div>

            {lines.length > 0 ? (
              <div className="space-y-3">
                {lines.map((line, index) => (
                  <div key={line.productId} className="grid grid-cols-[1fr_90px_140px] items-end gap-3 rounded-xl border border-border/70 p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{line.productName}</p>
                      <p className="text-xs text-muted-foreground">Eligible qty: {line.maxQty}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Return qty</p>
                      <Input
                        type="number"
                        min="0"
                        max={line.maxQty}
                        className="h-9"
                        value={line.quantity}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, quantity: event.target.value } : entry))
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Condition</p>
                      <Select
                        value={line.condition}
                        onValueChange={(value) =>
                          setLines((current) =>
                            current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, condition: value as SalesReturnCondition } : entry))
                          )
                        }
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="good">Good — restock</SelectItem>
                          <SelectItem value="damaged">Damaged — write off</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">Estimated refund</p>
                  <p className="mt-1 text-xl font-semibold">{formatCurrency(previewRefund, currency)}</p>
                </div>
              </div>
            ) : selectedOrderId ? (
              <p className="text-sm text-muted-foreground">Every item on this order has already been fully returned.</p>
            ) : null}

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Inspection note <span className="font-normal text-muted-foreground">(optional)</span></p>
              <Textarea value={inspectionNote} onChange={(event) => setInspectionNote(event.target.value)} placeholder="What did the return inspection find?" rows={2} />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">Record return</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
