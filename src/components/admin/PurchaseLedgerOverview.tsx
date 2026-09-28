"use client"

import { useMemo, useState } from 'react'
import { BookOpen, Boxes, Truck } from 'lucide-react'

import { ExportMenu } from '@/components/admin/ExportMenu'
import { VendorLedgerDialog } from '@/components/admin/VendorPaymentDialogs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { PurchaseMaterialUnit } from '@/lib/erp/types'
import { computeFactoryStock, computeProductLedger, computeVendorSummary, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

function formatAmount(value: number) {
  return value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatQty(value: number) {
  return value.toLocaleString('en-BD', { maximumFractionDigits: 2 })
}

const UNIT_LABEL: Record<PurchaseMaterialUnit, string> = { kg: 'Kg', pcs: 'Pcs' }

const TYPE_LABEL = { purchase: 'Purchase', sale: 'Dealer sale', usage: 'Other usage' } as const

// Ledger Overview (2026-09-29 client spec §13): the Purchase module's two
// connected ledgers side by side —
//   Vendor perspective:  Total Purchase / Total Payment / Current Due
//   Product perspective: Total Purchased / Total Sold / Current Stock
// A purchase line feeds both (money into the vendor's due, qty into the
// product's stock). Each row opens its full statement: the existing Vendor
// Statement, or the Product Statement below (inventory ledger + which
// vendor supplied it, whose names open that vendor's statement in turn).
export function PurchaseLedgerOverview() {
  const { data } = useERP()
  const [vendorLedgerId, setVendorLedgerId] = useState<string | null>(null)
  const [vendorLedgerOpen, setVendorLedgerOpen] = useState(false)
  const [productId, setProductId] = useState<string | null>(null)
  const [productOpen, setProductOpen] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const vendorRows = useMemo(
    () =>
      toArray(data?.vendors)
        .map((vendor) => ({ vendor, summary: computeVendorSummary(data ?? null, vendor.id) }))
        .sort((left, right) => right.summary.currentDue - left.summary.currentDue),
    [data]
  )
  const vendorTotals = vendorRows.reduce(
    (totals, row) => ({
      purchase: totals.purchase + row.summary.totalPurchase,
      paid: totals.paid + row.summary.totalPaid,
      due: totals.due + row.summary.currentDue,
    }),
    { purchase: 0, paid: 0, due: 0 }
  )

  const productRows = useMemo(
    () => computeFactoryStock(data ?? null).filter((row) => row.material.category === 'raw_material'),
    [data]
  )
  const productTotals = productRows
    .filter((row) => row.material.unit === 'kg')
    .reduce(
      (totals, row) => ({
        purchased: totals.purchased + row.purchasedQty,
        sold: totals.sold + row.soldQty,
        current: totals.current + row.currentQty,
      }),
      { purchased: 0, sold: 0, current: 0 }
    )

  function openVendor(vendorId: string) {
    setVendorLedgerId(vendorId)
    setVendorLedgerOpen(true)
  }

  function openProduct(materialId: string) {
    setProductId(materialId)
    setProductOpen(true)
  }

  return (
    <div className="space-y-6">
      {feedback ? (
        <Card className="border-border/70 bg-primary/5 shadow-sm">
          <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-muted-foreground" /> Vendor-wise — financial ledger
              </CardTitle>
              <CardDescription>Previous due + Purchase − Payment = Current due. Click a vendor for the full statement.</CardDescription>
            </div>
            <ExportMenu
              filenameBase="vendor-wise-summary"
              title="Vendor-wise Summary"
              headers={['Vendor', 'Previous Due', 'Total Purchase', 'Total Payment', 'Current Due']}
              rows={vendorRows.map((row) => [
                row.vendor.name,
                row.summary.openingDue,
                row.summary.totalPurchase,
                row.summary.totalPaid,
                row.summary.currentDue,
              ])}
            />
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Total purchase</TableHead>
                    <TableHead className="text-right">Total payment</TableHead>
                    <TableHead className="text-right">Current due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendorRows.map(({ vendor, summary }) => (
                    <TableRow key={vendor.id} className="cursor-pointer" onClick={() => openVendor(vendor.id)}>
                      <TableCell className="font-medium">
                        {vendor.name}
                        {summary.openingDue ? (
                          <p className="text-[11px] font-normal text-muted-foreground">Previous due {formatAmount(summary.openingDue)}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(summary.totalPurchase)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{formatAmount(summary.totalPaid)}</TableCell>
                      <TableCell className={cn('text-right font-semibold tabular-nums', summary.currentDue > 0 && 'text-destructive')}>
                        {formatAmount(summary.currentDue)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {vendorRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                        No vendors yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(vendorTotals.purchase)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(vendorTotals.paid)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(vendorTotals.due)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Boxes className="h-5 w-5 text-muted-foreground" /> Product-wise — inventory ledger
              </CardTitle>
              <CardDescription>Purchased − Sold = Current stock (factory). Click a product for its full statement.</CardDescription>
            </div>
            <ExportMenu
              filenameBase="product-wise-summary"
              title="Product-wise Summary"
              headers={['Product', 'Unit', 'Total Purchased', 'Total Sold', 'Current Stock']}
              rows={productRows.map((row) => [
                row.material.name,
                UNIT_LABEL[row.material.unit],
                row.purchasedQty,
                row.soldQty,
                row.currentQty,
              ])}
            />
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Total purchased</TableHead>
                    <TableHead className="text-right">Total sold</TableHead>
                    <TableHead className="text-right">Current stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productRows.map((row) => {
                    const unit = UNIT_LABEL[row.material.unit]
                    return (
                      <TableRow key={row.material.id} className="cursor-pointer" onClick={() => openProduct(row.material.id)}>
                        <TableCell className="font-medium">{row.material.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQty(row.purchasedQty)} {unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">
                          {formatQty(row.soldQty)} {unit}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-semibold tabular-nums',
                            row.currentQty <= row.material.minStock && 'text-destructive'
                          )}
                        >
                          {formatQty(row.currentQty)} {unit}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {productRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                        No raw-material products yet — a purchase adds them automatically.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                      <TableCell>Total (Kg)</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty(productTotals.purchased)} Kg</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty(productTotals.sold)} Kg</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty(productTotals.current)} Kg</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <VendorLedgerDialog
        open={vendorLedgerOpen}
        onOpenChange={setVendorLedgerOpen}
        vendorId={vendorLedgerId}
        onFeedback={setFeedback}
      />
      <ProductStatementDialog
        open={productOpen}
        onOpenChange={setProductOpen}
        materialId={productId}
        onOpenVendor={(vendorId) => {
          setProductOpen(false)
          openVendor(vendorId)
        }}
      />
    </div>
  )
}

// Product Statement — the inventory-side twin of the Vendor Statement.
export function ProductStatementDialog({
  open,
  onOpenChange,
  materialId,
  onOpenVendor,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  materialId: string | null
  onOpenVendor?: (vendorId: string) => void
}) {
  const { data } = useERP()
  const ledger = useMemo(() => (materialId ? computeProductLedger(data ?? null, materialId) : null), [data, materialId])
  const stock = ledger?.stock
  const unit = stock ? UNIT_LABEL[stock.material.unit] : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Product statement — {stock?.material.name ?? ''}</DialogTitle>
          <DialogDescription>Opening + Purchased − Sold − Other usage = Current stock</DialogDescription>
        </DialogHeader>

        {stock ? (
          <>
            <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Total purchased</p>
                <p className="font-semibold tabular-nums">
                  {formatQty(stock.purchasedQty)} {unit}
                </p>
                <p className="text-[11px] text-muted-foreground">{formatAmount(ledger?.totalPurchaseAmount ?? 0)} Tk</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total sold</p>
                <p className="font-semibold tabular-nums text-emerald-600">
                  {formatQty(stock.soldQty)} {unit}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Other usage</p>
                <p className="font-semibold tabular-nums">
                  {formatQty(stock.otherUsageQty)} {unit}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current stock</p>
                <p className={cn('font-semibold tabular-nums', stock.currentQty <= stock.material.minStock && 'text-destructive')}>
                  {formatQty(stock.currentQty)} {unit}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatQty(stock.looseQty)} loose + {formatQty(stock.packedQty)} packed
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Purchased from (vendor-wise)</p>
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Purchases</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Avg. rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Vendor due now</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ledger?.vendors ?? []).map((vendor) => (
                      <TableRow key={vendor.vendorId ?? vendor.vendorName}>
                        <TableCell className="font-medium">{vendor.vendorName}</TableCell>
                        <TableCell className="text-right tabular-nums">{vendor.purchases}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQty(vendor.qty)} {unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{vendor.qty ? formatAmount(vendor.amount / vendor.qty) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatAmount(vendor.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {vendor.vendorId ? formatAmount(computeVendorSummary(data ?? null, vendor.vendorId).currentDue) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {vendor.vendorId && onOpenVendor ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              onClick={() => onOpenVendor(vendor.vendorId!)}
                            >
                              <BookOpen className="h-3.5 w-3.5" /> Statement
                            </button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(ledger?.vendors ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-14 text-center text-muted-foreground">
                          Not purchased from any vendor yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Stock movement</p>
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Date</TableHead>
                      <TableHead>Transaction</TableHead>
                      <TableHead>Vendor / Dealer</TableHead>
                      <TableHead className="text-right">In (+)</TableHead>
                      <TableHead className="text-right">Out (−)</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/20">
                      <TableCell>Previous</TableCell>
                      <TableCell className="font-medium">Opening stock</TableCell>
                      <TableCell />
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatQty(stock.openingQty)} {unit}
                      </TableCell>
                    </TableRow>
                    {(ledger?.rows ?? []).map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="whitespace-nowrap align-top">{formatDate(row.date)}</TableCell>
                        <TableCell className="min-w-44 align-top">
                          <div className="flex items-center gap-2">
                            <Badge variant={row.type === 'purchase' ? 'secondary' : row.type === 'sale' ? 'default' : 'outline'}>
                              {TYPE_LABEL[row.type]}
                            </Badge>
                            <span className="text-sm">{row.reference}</span>
                          </div>
                          {row.detail ? <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p> : null}
                        </TableCell>
                        <TableCell className="align-top">
                          {row.party}
                          {row.amount ? <p className="text-xs text-muted-foreground">{formatAmount(row.amount)} Tk</p> : null}
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">{row.qtyIn ? formatQty(row.qtyIn) : '—'}</TableCell>
                        <TableCell className="text-right align-top tabular-nums text-emerald-600">
                          {row.qtyOut ? formatQty(row.qtyOut) : '—'}
                        </TableCell>
                        <TableCell className={cn('text-right align-top font-semibold tabular-nums', row.balance < 0 && 'text-destructive')}>
                          {formatQty(row.balance)} {unit}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(ledger?.rows ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-14 text-center text-muted-foreground">
                          No purchases or sales yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Product not found.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
