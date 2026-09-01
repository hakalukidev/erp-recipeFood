"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { ArrowRightLeft, Ban, Check, PackageCheck, PackageSearch, Plus, Truck, X } from 'lucide-react'

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
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { StockTransferRecord } from '@/lib/erp/types'
import { formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const emptyTransferForm = {
  productId: '',
  fromWarehouseId: '',
  toWarehouseId: '',
  quantity: '1',
  note: '',
}

const statusTone: Record<StockTransferRecord['status'], string> = {
  requested: 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300',
  approved: 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300',
  'in-transit': 'border-violet-200 bg-violet-500/10 text-violet-700 dark:border-violet-900 dark:text-violet-300',
  received: 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
  rejected: 'border-rose-500/40 text-rose-600 dark:text-rose-400',
  cancelled: 'border-border bg-muted text-muted-foreground',
}

export function StockTransferSection() {
  const {
    data,
    createStockTransferRequest,
    approveStockTransfer,
    rejectStockTransfer,
    dispatchStockTransfer,
    receiveStockTransfer,
    cancelStockTransfer,
  } = useERP()

  const products = useMemo(() => toArray(data?.products), [data?.products])
  const warehouses = useMemo(() => toArray(data?.warehouses), [data?.warehouses])
  const transfers = useMemo(
    () => toArray(data?.stockTransfers).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.stockTransfers]
  )
  const warehouseStocks = useMemo(
    () =>
      toArray(data?.warehouseStocks).sort((left, right) => {
        if (left.productName !== right.productName) return left.productName.localeCompare(right.productName)
        return left.warehouseId.localeCompare(right.warehouseId)
      }),
    [data?.warehouseStocks]
  )

  const warehouseName = useMemo(() => {
    const map = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]))
    return (warehouseId: string) => map.get(warehouseId) ?? warehouseId
  }, [warehouses])

  const [feedback, setFeedback] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyTransferForm)

  function openDialog() {
    setFeedback(null)
    setForm(emptyTransferForm)
    setDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    try {
      await createStockTransferRequest({
        productId: form.productId,
        fromWarehouseId: form.fromWarehouseId,
        toWarehouseId: form.toWarehouseId,
        quantity: Number(form.quantity),
        note: form.note,
      })
      setFeedback('Transfer request created — awaiting approval.')
      setDialogOpen(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to create transfer request.')
    }
  }

  async function handleAction(action: () => Promise<void>, successMessage: string) {
    setFeedback(null)
    try {
      await action()
      setFeedback(successMessage)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to update transfer.')
    }
  }

  return (
    <div className="space-y-6">
      {feedback ? (
        <Card className="border-border/70 bg-primary/5 shadow-sm">
          <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ArrowRightLeft className="h-4.5 w-4.5" />
            </div>
            <div>
              <CardTitle>Stock transfers</CardTitle>
              <CardDescription>Transfer Request → Approval → Dispatch → In Transit → Receive — both warehouses update automatically.</CardDescription>
            </div>
          </div>
          <Button onClick={openDialog} className="h-10 rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            Request transfer
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Transfer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell className="min-w-36">
                      <p className="font-semibold">{transfer.transferNumber}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(transfer.createdAt)}</p>
                    </TableCell>
                    <TableCell>{transfer.productName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {transfer.fromWarehouseName} → {transfer.toWarehouseName}
                    </TableCell>
                    <TableCell>{transfer.quantity}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('rounded-full', statusTone[transfer.status])}>
                        {transfer.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {transfer.status === 'requested' ? (
                          <>
                            <Button
                              size="sm"
                              className="h-8 rounded-full"
                              onClick={() => void handleAction(() => approveStockTransfer(transfer.id), `${transfer.transferNumber} approved.`)}
                            >
                              <Check className="mr-1 h-3.5 w-3.5" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-full text-rose-600 hover:text-rose-600 dark:text-rose-400"
                              onClick={() => void handleAction(() => rejectStockTransfer(transfer.id), `${transfer.transferNumber} rejected.`)}
                            >
                              <X className="mr-1 h-3.5 w-3.5" /> Reject
                            </Button>
                          </>
                        ) : null}
                        {transfer.status === 'approved' ? (
                          <>
                            <Button
                              size="sm"
                              className="h-8 rounded-full"
                              onClick={() => void handleAction(() => dispatchStockTransfer(transfer.id), `${transfer.transferNumber} dispatched — in transit.`)}
                            >
                              <Truck className="mr-1 h-3.5 w-3.5" /> Dispatch
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 rounded-full p-0 text-rose-600 hover:text-rose-600 dark:text-rose-400"
                              onClick={() => void handleAction(() => cancelStockTransfer(transfer.id), `${transfer.transferNumber} cancelled.`)}
                              aria-label={`Cancel ${transfer.transferNumber}`}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                        {transfer.status === 'in-transit' ? (
                          <Button
                            size="sm"
                            className="h-8 rounded-full"
                            onClick={() => void handleAction(() => receiveStockTransfer(transfer.id), `${transfer.transferNumber} received at ${transfer.toWarehouseName}.`)}
                          >
                            <PackageCheck className="mr-1 h-3.5 w-3.5" /> Receive
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {transfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                      No stock transfers yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <PackageSearch className="h-4.5 w-4.5" />
            </div>
            <div>
              <CardTitle>Stock by warehouse</CardTitle>
              <CardDescription>Real-time breakdown of where each product's stock physically sits.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Product</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouseStocks.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.productName}</TableCell>
                    <TableCell>{warehouseName(row.warehouseId)}</TableCell>
                    <TableCell>{row.quantity}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(row.updatedAt)}</TableCell>
                  </TableRow>
                ))}
                {warehouseStocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      No per-warehouse stock recorded yet — this fills in as products are added, purchased, sold, or transferred.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request stock transfer</DialogTitle>
            <DialogDescription>Moves stock between two warehouses. Neither warehouse updates until it's approved, dispatched, and received.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Product<span className="ml-0.5 text-rose-500">*</span></p>
              <Select value={form.productId} onValueChange={(value) => setForm((current) => ({ ...current, productId: value }))} required>
                <SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">From warehouse<span className="ml-0.5 text-rose-500">*</span></p>
                <Select value={form.fromWarehouseId} onValueChange={(value) => setForm((current) => ({ ...current, fromWarehouseId: value }))} required>
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">To warehouse<span className="ml-0.5 text-rose-500">*</span></p>
                <Select value={form.toWarehouseId} onValueChange={(value) => setForm((current) => ({ ...current, toWarehouseId: value }))} required>
                  <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Quantity<span className="ml-0.5 text-rose-500">*</span></p>
              <Input type="number" min="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Note <span className="font-normal text-muted-foreground">(optional)</span></p>
              <Input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Reason for transfer" />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">Submit request</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
