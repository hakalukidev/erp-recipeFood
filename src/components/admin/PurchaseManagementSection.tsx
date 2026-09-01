"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Ban, CheckCircle2, ClipboardList, Plus, Receipt, RotateCcw, Trash2, Truck, Wallet } from 'lucide-react'

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
import type { PurchaseOrderRecord, PurchaseRequisitionRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type NewPoItem = { productId: string; quantity: string; unitCost: string }

const emptyPoForm = {
  requisitionId: '',
  supplierId: '',
  warehouseId: '',
  currency: 'BDT',
  expectedDate: '',
  items: [{ productId: '', quantity: '1', unitCost: '' }] as NewPoItem[],
}

type ReceiveItemState = {
  productId: string
  productName: string
  ordered: number
  receivedQuantity: string
  rejectedQuantity: string
  batchNumber: string
  manufacturingDate: string
  expiryDate: string
}

const poStatusTone: Record<PurchaseOrderRecord['status'], string> = {
  ordered: 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300',
  received: 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
  cancelled: 'border-rose-500/40 text-rose-600 dark:text-rose-400',
}

const qcTone: Record<PurchaseOrderRecord['qualityCheckStatus'], string> = {
  pending: 'border-border bg-muted text-muted-foreground',
  passed: 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
  partial: 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300',
  failed: 'border-rose-500/40 text-rose-600 dark:text-rose-400',
}

const billTone: Record<PurchaseOrderRecord['billStatus'], string> = {
  unbilled: 'border-border bg-muted text-muted-foreground',
  billed: 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300',
  paid: 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
}

type ReturnLineState = { productId: string; productName: string; maxQty: number; quantity: string; unitCost: number }

export function PurchaseManagementSection() {
  const {
    data,
    dismissPurchaseRequisition,
    createPurchaseOrder,
    receivePurchaseOrder,
    cancelPurchaseOrder,
    recordSupplierPayment,
    createPurchaseReturn,
  } = useERP()

  const suppliers = useMemo(() => toArray(data?.suppliers), [data?.suppliers])
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const warehouses = useMemo(() => toArray(data?.warehouses), [data?.warehouses])
  const currency = data?.settings.currency

  const requisitions = useMemo(
    () =>
      toArray(data?.purchaseRequisitions)
        .filter((requisition) => requisition.status === 'open')
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.purchaseRequisitions]
  )

  const purchaseOrders = useMemo(
    () => toArray(data?.purchaseOrders).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.purchaseOrders]
  )
  const purchaseReturns = useMemo(
    () => toArray(data?.purchaseReturns).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.purchaseReturns]
  )

  const [feedback, setFeedback] = useState<string | null>(null)

  const [poDialogOpen, setPoDialogOpen] = useState(false)
  const [poForm, setPoForm] = useState(emptyPoForm)

  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrderRecord | null>(null)
  const [receiveItems, setReceiveItems] = useState<ReceiveItemState[]>([])
  const [qualityCheckNote, setQualityCheckNote] = useState('')
  const [grnNumber, setGrnNumber] = useState('')
  const [transportCost, setTransportCost] = useState('0')
  const [otherCost, setOtherCost] = useState('0')
  const [qcMoisture, setQcMoisture] = useState('')
  const [qcColour, setQcColour] = useState('')
  const [qcGrade, setQcGrade] = useState('')
  const [qcOfficerName, setQcOfficerName] = useState('')

  const [paymentTarget, setPaymentTarget] = useState<PurchaseOrderRecord | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('0')

  const [returnTarget, setReturnTarget] = useState<PurchaseOrderRecord | null>(null)
  const [returnLines, setReturnLines] = useState<ReturnLineState[]>([])
  const [returnReason, setReturnReason] = useState('')

  function alreadyReturnedFor(purchaseOrderId: string, productId: string) {
    return purchaseReturns
      .filter((entry) => entry.purchaseOrderId === purchaseOrderId)
      .flatMap((entry) => entry.items)
      .filter((item) => item.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0)
  }

  function openReturnDialog(purchaseOrder: PurchaseOrderRecord) {
    setFeedback(null)
    setReturnTarget(purchaseOrder)
    setReturnReason('')
    setReturnLines(
      purchaseOrder.items
        .map((item) => {
          const accepted = item.receivedQuantity - item.rejectedQuantity
          const maxQty = accepted - alreadyReturnedFor(purchaseOrder.id, item.productId)
          return { productId: item.productId, productName: item.productName, maxQty, quantity: '0', unitCost: item.unitCost }
        })
        .filter((line) => line.maxQty > 0)
    )
  }

  const previewReturnValue = returnLines.reduce((sum, line) => sum + line.unitCost * Number(line.quantity || 0), 0)

  async function handleRecordReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!returnTarget) return
    setFeedback(null)

    const items = returnLines
      .filter((line) => Number(line.quantity || 0) > 0)
      .map((line) => ({ productId: line.productId, quantity: Number(line.quantity) }))

    if (items.length === 0) {
      setFeedback('Enter at least one product quantity to return.')
      return
    }

    try {
      await createPurchaseReturn({ purchaseOrderId: returnTarget.id, items, reason: returnReason })
      setFeedback(`Purchase return recorded against ${returnTarget.poNumber}.`)
      setReturnTarget(null)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record purchase return.')
    }
  }

  function openNewPoDialog(requisition?: PurchaseRequisitionRecord) {
    setFeedback(null)
    setPoForm({
      ...emptyPoForm,
      requisitionId: requisition?.id ?? '',
      items: requisition
        ? [{ productId: requisition.productId, quantity: String(requisition.suggestedQty), unitCost: '' }]
        : [{ productId: '', quantity: '1', unitCost: '' }],
    })
    setPoDialogOpen(true)
  }

  async function handleDismissRequisition(requisition: PurchaseRequisitionRecord) {
    setFeedback(null)
    try {
      await dismissPurchaseRequisition(requisition.id)
      setFeedback(`Requisition for ${requisition.productName} dismissed.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to dismiss requisition.')
    }
  }

  async function handleCreatePo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    try {
      const poId = await createPurchaseOrder({
        requisitionId: poForm.requisitionId || undefined,
        supplierId: poForm.supplierId,
        warehouseId: poForm.warehouseId,
        currency: poForm.currency,
        expectedDate: poForm.expectedDate,
        items: poForm.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
        })),
      })
      setFeedback(`Purchase order created (${poId}).`)
      setPoDialogOpen(false)
      setPoForm(emptyPoForm)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to create purchase order.')
    }
  }

  function openReceiveDialog(purchaseOrder: PurchaseOrderRecord) {
    setFeedback(null)
    setReceiveTarget(purchaseOrder)
    setReceiveItems(
      purchaseOrder.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        ordered: item.quantity,
        receivedQuantity: String(item.quantity),
        rejectedQuantity: '0',
        batchNumber: '',
        manufacturingDate: '',
        expiryDate: '',
      }))
    )
    setQualityCheckNote('')
    setGrnNumber('')
    setTransportCost('0')
    setOtherCost('0')
    setQcMoisture('')
    setQcColour('')
    setQcGrade('')
    setQcOfficerName('')
  }

  async function handleReceivePo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!receiveTarget) return
    setFeedback(null)

    try {
      await receivePurchaseOrder(receiveTarget.id, {
        items: receiveItems.map((item) => ({
          productId: item.productId,
          receivedQuantity: Number(item.receivedQuantity),
          rejectedQuantity: Number(item.rejectedQuantity),
          batchNumber: item.batchNumber,
          manufacturingDate: item.manufacturingDate,
          expiryDate: item.expiryDate,
        })),
        qualityCheckNote,
        grnNumber,
        transportCost: Number(transportCost),
        otherCost: Number(otherCost),
        qc: { moisture: qcMoisture, colour: qcColour, qualityGrade: qcGrade, qcOfficerName },
      })
      setFeedback(`Purchase order ${receiveTarget.poNumber} received — stock and landed cost updated.`)
      setReceiveTarget(null)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to receive purchase order.')
    }
  }

  async function handleCancelPo(purchaseOrder: PurchaseOrderRecord) {
    if (!window.confirm(`Cancel purchase order ${purchaseOrder.poNumber}?`)) return
    setFeedback(null)
    try {
      await cancelPurchaseOrder(purchaseOrder.id)
      setFeedback(`Purchase order ${purchaseOrder.poNumber} cancelled.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to cancel purchase order.')
    }
  }

  async function handleRecordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!paymentTarget) return
    setFeedback(null)

    try {
      await recordSupplierPayment(paymentTarget.id, Number(paymentAmount))
      setFeedback(`Payment recorded against ${paymentTarget.poNumber}.`)
      setPaymentTarget(null)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record payment.')
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
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
            <div>
              <CardTitle>Purchase requisitions</CardTitle>
              <CardDescription>Auto-raised whenever a product's stock falls below its reorder level.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Product</TableHead>
                  <TableHead>Current stock</TableHead>
                  <TableHead>Reorder level</TableHead>
                  <TableHead>Suggested qty</TableHead>
                  <TableHead>Raised</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requisitions.map((requisition) => (
                  <TableRow key={requisition.id}>
                    <TableCell className="font-medium">{requisition.productName}</TableCell>
                    <TableCell className="font-semibold text-rose-600 dark:text-rose-400">{requisition.currentStock}</TableCell>
                    <TableCell>{requisition.reorderLevel}</TableCell>
                    <TableCell>{requisition.suggestedQty}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(requisition.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" className="h-8 rounded-full" onClick={() => openNewPoDialog(requisition)}>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Create PO
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => void handleDismissRequisition(requisition)}>
                          Dismiss
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {requisitions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                      No open requisitions — stock levels are healthy.
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
              <ClipboardList className="h-4.5 w-4.5" />
            </div>
            <div>
              <CardTitle>Purchase orders</CardTitle>
              <CardDescription>Requisition → PO → Goods Receive → Quality Check → GRN → Accounts Payable.</CardDescription>
            </div>
          </div>
          <Button onClick={() => openNewPoDialog()} className="h-10 rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            New purchase order
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Bill / AP</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="min-w-40">
                      <p className="font-semibold">{po.poNumber}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(po.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">{po.warehouseName}</p>
                      {po.grnNumber ? <p className="text-xs text-muted-foreground">GRN: {po.grnNumber}</p> : null}
                    </TableCell>
                    <TableCell>{po.supplierName}</TableCell>
                    <TableCell className="min-w-48 text-sm text-muted-foreground">
                      {po.items.map((item) => `${item.productName} x${item.quantity}${item.batchNumber ? ` (batch ${item.batchNumber})` : ''}`).join(', ')}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(po.subtotal, po.currency || currency)}
                      {po.status === 'received' && po.totalLandedCost !== po.subtotal ? (
                        <p className="text-xs text-muted-foreground">Landed: {formatCurrency(po.totalLandedCost, po.currency || currency)}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className={cn('rounded-full', poStatusTone[po.status])}>
                          {po.status}
                        </Badge>
                        {po.status === 'received' ? (
                          <Badge variant="outline" className={cn('rounded-full', qcTone[po.qualityCheckStatus])}>
                            QC: {po.qualityCheckStatus}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-40">
                      {po.status === 'received' ? (
                        <>
                          <Badge variant="outline" className={cn('rounded-full', billTone[po.billStatus])}>
                            {po.billStatus}
                          </Badge>
                          {po.due > 0 ? (
                            <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                              Due {formatCurrency(po.due, po.currency || currency)}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not billed yet</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {po.status === 'ordered' ? (
                          <>
                            <Button size="sm" className="h-8 rounded-full" onClick={() => openReceiveDialog(po)}>
                              <Truck className="mr-1 h-3.5 w-3.5" /> Receive
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 rounded-full p-0 text-rose-600 hover:text-rose-600 dark:text-rose-400"
                              onClick={() => void handleCancelPo(po)}
                              aria-label={`Cancel ${po.poNumber}`}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                        {po.status === 'received' && po.due > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-full"
                            onClick={() => {
                              setFeedback(null)
                              setPaymentTarget(po)
                              setPaymentAmount(String(po.due))
                            }}
                          >
                            <Wallet className="mr-1 h-3.5 w-3.5" /> Pay
                          </Button>
                        ) : null}
                        {po.status === 'received' ? (
                          <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => openReturnDialog(po)}>
                            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Return
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {purchaseOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                      No purchase orders yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {purchaseReturns.length > 0 ? (
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
                <RotateCcw className="h-4.5 w-4.5" />
              </div>
              <div>
                <CardTitle>Purchase returns</CardTitle>
                <CardDescription>Goods sent back to the supplier — stock and accounts payable update automatically.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Return</TableHead>
                    <TableHead>PO</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseReturns.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.returnNumber}</TableCell>
                      <TableCell>{entry.poNumber}</TableCell>
                      <TableCell>{entry.supplierName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.items.map((item) => `${item.productName} x${item.quantity}`).join(', ')}
                      </TableCell>
                      <TableCell>{formatCurrency(entry.totalValue, currency)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(entry.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={poDialogOpen} onOpenChange={setPoDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New purchase order</DialogTitle>
            <DialogDescription>Placing the order does not touch stock yet — that happens on receipt (GRN).</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreatePo}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Supplier<span className="ml-0.5 text-rose-500">*</span></p>
                <Select value={poForm.supplierId} onValueChange={(value) => setPoForm((current) => ({ ...current, supplierId: value }))} required>
                  <SelectTrigger><SelectValue placeholder="Select a supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Receiving warehouse<span className="ml-0.5 text-rose-500">*</span></p>
                <Select value={poForm.warehouseId} onValueChange={(value) => setPoForm((current) => ({ ...current, warehouseId: value }))} required>
                  <SelectTrigger><SelectValue placeholder="Select a warehouse" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">Items<span className="ml-0.5 text-rose-500">*</span></p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPoForm((current) => ({ ...current, items: [...current.items, { productId: '', quantity: '1', unitCost: '' }] }))}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Add item
                </Button>
              </div>
              {poForm.items.map((item, index) => (
                <div key={index} className="grid grid-cols-[1fr_90px_110px_auto] items-end gap-2 rounded-xl border border-border/70 p-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Product</p>
                    <Select
                      value={item.productId}
                      onValueChange={(value) =>
                        setPoForm((current) => ({
                          ...current,
                          items: current.items.map((entry, itemIndex) => (itemIndex === index ? { ...entry, productId: value } : entry)),
                        }))
                      }
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Qty</p>
                    <Input
                      type="number"
                      min="1"
                      className="h-9"
                      value={item.quantity}
                      onChange={(event) =>
                        setPoForm((current) => ({
                          ...current,
                          items: current.items.map((entry, itemIndex) => (itemIndex === index ? { ...entry, quantity: event.target.value } : entry)),
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Unit cost</p>
                    <Input
                      type="number"
                      min="0"
                      className="h-9"
                      value={item.unitCost}
                      onChange={(event) =>
                        setPoForm((current) => ({
                          ...current,
                          items: current.items.map((entry, itemIndex) => (itemIndex === index ? { ...entry, unitCost: event.target.value } : entry)),
                        }))
                      }
                      required
                    />
                  </div>
                  {poForm.items.length > 1 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setPoForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}
                      aria-label={`Remove item ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Expected date <span className="font-normal text-muted-foreground">(optional)</span></p>
                <Input type="date" value={poForm.expectedDate} onChange={(event) => setPoForm((current) => ({ ...current, expectedDate: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Currency</p>
                <Input value={poForm.currency} onChange={(event) => setPoForm((current) => ({ ...current, currency: event.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setPoDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">Create purchase order</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(receiveTarget)} onOpenChange={(open) => !open && setReceiveTarget(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receive {receiveTarget?.poNumber}</DialogTitle>
            <DialogDescription>
              Goods Receive + Quality Check + GRN, in one step. Only quantities that pass QC are added to warehouse stock and billed.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleReceivePo}>
            <div className="space-y-3">
              {receiveItems.map((item, index) => (
                <div key={item.productId} className="space-y-3 rounded-xl border border-border/70 p-3">
                  <div className="grid grid-cols-[1fr_100px_100px] items-end gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">Ordered {item.ordered}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Received</p>
                      <Input
                        type="number"
                        min="0"
                        max={item.ordered}
                        className="h-9"
                        value={item.receivedQuantity}
                        onChange={(event) =>
                          setReceiveItems((current) =>
                            current.map((entry, itemIndex) => (itemIndex === index ? { ...entry, receivedQuantity: event.target.value } : entry))
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Rejected (QC)</p>
                      <Input
                        type="number"
                        min="0"
                        max={item.ordered}
                        className="h-9"
                        value={item.rejectedQuantity}
                        onChange={(event) =>
                          setReceiveItems((current) =>
                            current.map((entry, itemIndex) => (itemIndex === index ? { ...entry, rejectedQuantity: event.target.value } : entry))
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Batch <span className="font-normal">(optional)</span></p>
                      <Input
                        className="h-9"
                        value={item.batchNumber}
                        onChange={(event) =>
                          setReceiveItems((current) =>
                            current.map((entry, itemIndex) => (itemIndex === index ? { ...entry, batchNumber: event.target.value } : entry))
                          )
                        }
                        placeholder="e.g. B-2409"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Mfg. date <span className="font-normal">(optional)</span></p>
                      <Input
                        type="date"
                        className="h-9"
                        value={item.manufacturingDate}
                        onChange={(event) =>
                          setReceiveItems((current) =>
                            current.map((entry, itemIndex) => (itemIndex === index ? { ...entry, manufacturingDate: event.target.value } : entry))
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Expiry date <span className="font-normal">(optional)</span></p>
                      <Input
                        type="date"
                        className="h-9"
                        value={item.expiryDate}
                        onChange={(event) =>
                          setReceiveItems((current) =>
                            current.map((entry, itemIndex) => (itemIndex === index ? { ...entry, expiryDate: event.target.value } : entry))
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Input placeholder="Moisture" value={qcMoisture} onChange={(event) => setQcMoisture(event.target.value)} />
              <Input placeholder="Colour" value={qcColour} onChange={(event) => setQcColour(event.target.value)} />
              <Input placeholder="Quality grade" value={qcGrade} onChange={(event) => setQcGrade(event.target.value)} />
              <Input placeholder="QC officer" value={qcOfficerName} onChange={(event) => setQcOfficerName(event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">GRN number <span className="font-normal text-muted-foreground">(optional — auto-generated)</span></p>
                <Input value={grnNumber} onChange={(event) => setGrnNumber(event.target.value)} placeholder="Auto-generated if blank" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Quality check note <span className="font-normal text-muted-foreground">(optional)</span></p>
                <Input value={qualityCheckNote} onChange={(event) => setQualityCheckNote(event.target.value)} placeholder="e.g. 2 bags damaged in transit" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Transport cost <span className="font-normal text-muted-foreground">(optional)</span></p>
                <Input type="number" min="0" value={transportCost} onChange={(event) => setTransportCost(event.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Other cost <span className="font-normal text-muted-foreground">(optional)</span></p>
                <Input type="number" min="0" value={otherCost} onChange={(event) => setOtherCost(event.target.value)} placeholder="0" />
              </div>
              <div className="sm:col-span-2 rounded-xl border border-border/70 bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">Total landed cost</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatCurrency(
                    receiveItems.reduce((sum, item) => {
                      const orderedItem = receiveTarget?.items.find((entry) => entry.productId === item.productId)
                      return sum + Number(item.receivedQuantity || 0) * (orderedItem?.unitCost ?? 0)
                    }, 0) + Number(transportCost || 0) + Number(otherCost || 0),
                    receiveTarget?.currency || currency
                  )}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setReceiveTarget(null)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">
                <CheckCircle2 className="mr-2 h-4 w-4" /> Confirm receipt
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(paymentTarget)} onOpenChange={(open) => !open && setPaymentTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment — {paymentTarget?.poNumber}</DialogTitle>
            <DialogDescription>
              Outstanding due: {formatCurrency(paymentTarget?.due ?? 0, paymentTarget?.currency || currency)}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleRecordPayment}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Amount</p>
              <Input type="number" min="0" max={paymentTarget?.due ?? 0} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setPaymentTarget(null)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">
                <Receipt className="mr-2 h-4 w-4" /> Record payment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(returnTarget)} onOpenChange={(open) => !open && setReturnTarget(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Return goods — {returnTarget?.poNumber}</DialogTitle>
            <DialogDescription>Only quantity already accepted into stock (and not returned before) can go back.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleRecordReturn}>
            {returnLines.length > 0 ? (
              <div className="space-y-3">
                {returnLines.map((line, index) => (
                  <div key={line.productId} className="grid grid-cols-[1fr_110px] items-end gap-3 rounded-xl border border-border/70 p-3">
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
                          setReturnLines((current) =>
                            current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, quantity: event.target.value } : entry))
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">Estimated return value</p>
                  <p className="mt-1 text-xl font-semibold">{formatCurrency(previewReturnValue, currency)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Every item on this purchase order has already been fully returned.</p>
            )}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Reason <span className="font-normal text-muted-foreground">(optional)</span></p>
              <Textarea value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="Why is this being returned?" rows={2} />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setReturnTarget(null)}>Cancel</Button>
              <Button type="submit" className="rounded-xl" disabled={returnLines.length === 0}>Record return</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
