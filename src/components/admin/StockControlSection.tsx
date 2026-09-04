"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Check, ClipboardCheck, PackageSearch, PackageX, Plus, ShieldAlert, X } from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { StockAdjustmentRecord } from '@/lib/erp/types'
import { formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const emptyAdjustmentForm = { productId: '', newQuantity: '0', reason: '' }

const adjustmentTone: Record<StockAdjustmentRecord['status'], string> = {
  pending: 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300',
  approved: 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
  rejected: 'border-rose-500/40 text-rose-600 dark:text-rose-400',
}

function daysUntil(dateStr: string) {
  if (!dateStr) return null
  const diffMs = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

export function StockControlSection() {
  const {
    data,
    createStockAdjustmentRequest,
    approveStockAdjustment,
    rejectStockAdjustment,
    createStockCount,
    releaseQcHold,
    scrapQcHold,
  } = useERP()

  const products = useMemo(() => toArray(data?.products), [data?.products])
  const adjustments = useMemo(
    () => toArray(data?.stockAdjustments).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.stockAdjustments]
  )
  const stockCounts = useMemo(
    () => toArray(data?.stockCounts).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.stockCounts]
  )
  const batches = useMemo(
    () =>
      toArray(data?.batches)
        .filter((batch) => batch.quantity > 0)
        .sort((left, right) => (left.expiryDate || '9999').localeCompare(right.expiryDate || '9999')),
    [data?.batches]
  )
  const qcHolds = useMemo(
    () => toArray(data?.qcHolds).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.qcHolds]
  )

  const [feedback, setFeedback] = useState<string | null>(null)

  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false)
  const [adjustmentForm, setAdjustmentForm] = useState(emptyAdjustmentForm)

  const [countDialogOpen, setCountDialogOpen] = useState(false)
  const [countPhysicalQty, setCountPhysicalQty] = useState<Record<string, string>>({})

  function openAdjustmentDialog(prefill?: Partial<typeof emptyAdjustmentForm>) {
    setFeedback(null)
    setAdjustmentForm({ ...emptyAdjustmentForm, ...prefill })
    setAdjustmentDialogOpen(true)
  }

  async function handleCreateAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    try {
      await createStockAdjustmentRequest({
        productId: adjustmentForm.productId,
        newQuantity: Number(adjustmentForm.newQuantity),
        reason: adjustmentForm.reason,
      })
      setFeedback('Stock adjustment submitted for approval.')
      setAdjustmentDialogOpen(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to submit stock adjustment.')
    }
  }

  async function handleApprove(adjustment: StockAdjustmentRecord) {
    setFeedback(null)
    try {
      await approveStockAdjustment(adjustment.id)
      setFeedback(`Adjustment for ${adjustment.productName} approved and applied.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to approve adjustment.')
    }
  }

  async function handleReject(adjustment: StockAdjustmentRecord) {
    setFeedback(null)
    try {
      await rejectStockAdjustment(adjustment.id)
      setFeedback(`Adjustment for ${adjustment.productName} rejected.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to reject adjustment.')
    }
  }

  async function handleReleaseHold(holdId: string, productName: string) {
    setFeedback(null)
    try {
      await releaseQcHold(holdId)
      setFeedback(`${productName} released from QC hold to sellable stock.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to release QC hold.')
    }
  }

  async function handleScrapHold(holdId: string, productName: string) {
    if (!window.confirm(`Scrap this QC hold for ${productName}? This is permanent.`)) return
    setFeedback(null)
    try {
      await scrapQcHold(holdId)
      setFeedback(`${productName} written off from QC hold.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to scrap QC hold.')
    }
  }

  function openCountDialog() {
    setFeedback(null)
    setCountPhysicalQty({})
    setCountDialogOpen(true)
  }

  function systemQtyFor(productId: string) {
    return data?.products[productId]?.stockQty ?? 0
  }

  async function handleSubmitCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const items = products
      .filter((product) => countPhysicalQty[product.id] !== undefined && countPhysicalQty[product.id] !== '')
      .map((product) => ({ productId: product.id, physicalQty: Number(countPhysicalQty[product.id]) }))

    if (items.length === 0) {
      setFeedback('Enter a physical count for at least one product.')
      return
    }

    try {
      const id = await createStockCount({ items })
      setFeedback(`Stock count recorded (${id}). Review the variance report below.`)
      setCountDialogOpen(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record stock count.')
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
              <ShieldAlert className="h-4.5 w-4.5" />
            </div>
            <div>
              <CardTitle>Stock adjustments</CardTitle>
              <CardDescription>The only sanctioned way to correct stock outside a real business document — reason, approval, and an audit log entry.</CardDescription>
            </div>
          </div>
          <Button onClick={() => openAdjustmentDialog()} className="h-10 rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            Request adjustment
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Product</TableHead>
                  <TableHead>Before → After</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((adjustment) => (
                  <TableRow key={adjustment.id}>
                    <TableCell className="font-medium">{adjustment.productName}</TableCell>
                    <TableCell className={cn(adjustment.delta < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                      {adjustment.quantityBefore} → {adjustment.quantityAfter}
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-sm text-muted-foreground" title={adjustment.reason}>{adjustment.reason}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('rounded-full', adjustmentTone[adjustment.status])}>{adjustment.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {adjustment.status === 'pending' ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" className="h-8 rounded-full" onClick={() => void handleApprove(adjustment)}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 rounded-full text-rose-600 hover:text-rose-600 dark:text-rose-400" onClick={() => void handleReject(adjustment)}>
                            <X className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <p className="text-right text-xs text-muted-foreground">{formatDate(adjustment.updatedAt)}</p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {adjustments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                      No stock adjustments requested yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ClipboardCheck className="h-4.5 w-4.5" />
            </div>
            <div>
              <CardTitle>Stock count</CardTitle>
              <CardDescription>Physical count vs. system stock — a variance report, not a direct correction.</CardDescription>
            </div>
          </div>
          <Button onClick={openCountDialog} className="h-10 rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            New count
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {stockCounts.map((count) => (
            <div key={count.id} className="space-y-2 rounded-2xl border border-border/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{count.countNumber}</p>
                <p className="text-xs text-muted-foreground">{formatDate(count.createdAt)} · {count.countedByName}</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Product</TableHead>
                      <TableHead>System</TableHead>
                      <TableHead>Physical</TableHead>
                      <TableHead>Variance</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {count.items.map((item) => (
                      <TableRow key={item.productId}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell>{item.systemQty}</TableCell>
                        <TableCell>{item.physicalQty}</TableCell>
                        <TableCell className={cn(item.variance !== 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                          {item.variance > 0 ? `+${item.variance}` : item.variance}
                        </TableCell>
                        <TableCell>
                          {item.variance !== 0 ? (
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-full"
                                onClick={() =>
                                  openAdjustmentDialog({
                                    productId: item.productId,
                                    newQuantity: String(item.physicalQty),
                                    reason: `Stock count variance (${count.countNumber})`,
                                  })
                                }
                              >
                                Adjust
                              </Button>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
          {stockCounts.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No stock counts recorded yet.</p> : null}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
              <PackageX className="h-4.5 w-4.5" />
            </div>
            <div>
              <CardTitle>QC holds</CardTitle>
              <CardDescription>Failed a quality check (Purchase or Production) — excluded from sellable stock until released or scrapped.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Product</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qcHolds.map((hold) => (
                  <TableRow key={hold.id}>
                    <TableCell className="font-medium">{hold.productName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{hold.sourceType} · {hold.sourceReference}</TableCell>
                    <TableCell>{hold.quantity}</TableCell>
                    <TableCell className="max-w-56 truncate text-sm text-muted-foreground" title={hold.reason}>{hold.reason}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'rounded-full',
                          hold.status === 'held'
                            ? 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                            : hold.status === 'released'
                              ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                              : 'border-border bg-muted text-muted-foreground'
                        )}
                      >
                        {hold.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {hold.status === 'held' ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" className="h-8 rounded-full" onClick={() => void handleReleaseHold(hold.id, hold.productName)}>Release</Button>
                          <Button size="sm" variant="outline" className="h-8 rounded-full text-rose-600 hover:text-rose-600 dark:text-rose-400" onClick={() => void handleScrapHold(hold.id, hold.productName)}>Scrap</Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {qcHolds.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                      No QC holds — nothing has failed a quality check.
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
              <CardTitle>Batches — FEFO picking suggestion</CardTitle>
              <CardDescription>Soonest-to-expire batch first. Pick from the top of this list during picking.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => {
                  const remaining = daysUntil(batch.expiryDate)
                  return (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.productName}</TableCell>
                      <TableCell>{batch.batchNumber}</TableCell>
                      <TableCell>{batch.quantity}</TableCell>
                      <TableCell>
                        {batch.expiryDate ? (
                          <div className="flex items-center gap-2">
                            <span>{formatDate(batch.expiryDate)}</span>
                            {remaining !== null && remaining < 0 ? (
                              <Badge variant="outline" className="rounded-full border-rose-500/40 text-rose-600 dark:text-rose-400">Expired</Badge>
                            ) : remaining !== null && remaining <= 14 ? (
                              <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300">
                                {remaining}d left
                              </Badge>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not tracked</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {batches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      No batches recorded yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request stock adjustment</DialogTitle>
            <DialogDescription>Applies only after someone with edit access approves it.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateAdjustment}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Product<span className="ml-0.5 text-rose-500">*</span></p>
              <Select value={adjustmentForm.productId} onValueChange={(value) => setAdjustmentForm((current) => ({ ...current, productId: value }))} required>
                <SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Correct quantity<span className="ml-0.5 text-rose-500">*</span></p>
              <Input type="number" min="0" value={adjustmentForm.newQuantity} onChange={(event) => setAdjustmentForm((current) => ({ ...current, newQuantity: event.target.value }))} required />
              {adjustmentForm.productId ? (
                <p className="text-xs text-muted-foreground">Current: {systemQtyFor(adjustmentForm.productId)}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Reason<span className="ml-0.5 text-rose-500">*</span></p>
              <Textarea value={adjustmentForm.reason} onChange={(event) => setAdjustmentForm((current) => ({ ...current, reason: event.target.value }))} placeholder="e.g. Damaged stock, count variance, data entry error" rows={2} required />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setAdjustmentDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">Submit for approval</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={countDialogOpen} onOpenChange={setCountDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New stock count</DialogTitle>
            <DialogDescription>Enter the physical count for whichever products you counted — the rest are left out of this count.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmitCount}>
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border/70 p-3">
              {products.map((product) => (
                <div key={product.id} className="grid grid-cols-[1fr_90px_90px] items-center gap-3">
                  <p className="text-sm">{product.name}</p>
                  <p className="text-xs text-muted-foreground">Sys: {systemQtyFor(product.id)}</p>
                  <Input
                    type="number"
                    min="0"
                    className="h-8"
                    placeholder="Physical"
                    value={countPhysicalQty[product.id] ?? ''}
                    onChange={(event) => setCountPhysicalQty((current) => ({ ...current, [product.id]: event.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCountDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">Save count</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
