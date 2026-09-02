"use client"

import { useMemo, useState } from 'react'
import {
  Award,
  Boxes,
  Building2,
  CreditCard,
  Percent,
  RotateCcw,
  Target as TargetIcon,
  Wallet,
} from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import type { CommissionRuleRecord, CommissionSlab, CustomerRecord, CustomerType, OrderRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

// order.total includes VAT (not revenue) — mirrors getOrderNetSales in the
// Finance/Accounting and Sales Force pages so Sales/Achievement here match
// the same net-sales figure the rest of the books use.
function getOrderNetSales(order: OrderRecord) {
  return order.total - (order.vat ?? 0)
}

function findMatchingSlab(slabs: CommissionSlab[], salesAmount: number) {
  const candidates = slabs.filter((slab) => salesAmount >= slab.minSales && (slab.maxSales === null || salesAmount <= slab.maxSales))
  if (!candidates.length) return null
  return candidates.reduce((best, slab) => (slab.minSales > best.minSales ? slab : best))
}

function computeProductCommission(rule: CommissionRuleRecord, matchingOrders: OrderRecord[]) {
  let total = 0
  for (const order of matchingOrders) {
    for (const item of order.items) {
      const rate = rule.productRates.find((entry) => entry.productId === item.productId)
      if (rate) total += item.unitPrice * item.quantity * (rate.percentage / 100)
    }
  }
  return total
}

function monthInputValue(date = new Date()) {
  return date.toISOString().slice(0, 7)
}

const CHANNEL_TYPES: CustomerType[] = ['dealer', 'distributor']
const CHANNEL_TYPE_LABEL: Record<CustomerType, string> = {
  dealer: 'Dealer',
  distributor: 'Distributor',
  retailer: 'Retailer',
  wholesaler: 'Wholesaler',
  corporate: 'Corporate',
}

export default function DealerManagementPage() {
  const { data } = useERP()
  const currency = data?.settings.currency

  const [channelType, setChannelType] = useState<CustomerType>('dealer')
  const [period, setPeriod] = useState(monthInputValue())
  const [detailCustomerId, setDetailCustomerId] = useState<string | undefined>(undefined)

  const customers = useMemo(() => toArray(data?.customers), [data?.customers])
  const orders = useMemo(() => toArray(data?.orders).filter((order) => order.status !== 'cancelled'), [data?.orders])
  const collections = useMemo(() => toArray(data?.collections), [data?.collections])
  const salesReturns = useMemo(() => toArray(data?.salesReturns), [data?.salesReturns])
  const targets = useMemo(() => toArray(data?.salesTargets), [data?.salesTargets])
  const activeRules = useMemo(() => toArray(data?.commissionRules).filter((rule) => rule.status === 'active'), [data?.commissionRules])

  const channelCustomers = useMemo(
    () => customers.filter((customer) => customer.customerType === channelType).sort((a, b) => a.name.localeCompare(b.name)),
    [customers, channelType]
  )

  const rows = useMemo(
    () =>
      channelCustomers.map((customer) => {
        const allOrders = orders.filter((order) => order.customerId === customer.id)
        const periodOrders = allOrders.filter((order) => order.createdAt.slice(0, 7) === period)
        const sales = periodOrders.reduce((sum, order) => sum + getOrderNetSales(order), 0)
        const discount = periodOrders.reduce((sum, order) => sum + (order.discount ?? 0) + (order.promotionalDiscount ?? 0), 0)

        const periodCollections = collections.filter((collection) => collection.customerId === customer.id && collection.collectionDate.slice(0, 7) === period)
        const collectionAmount = periodCollections.reduce((sum, collection) => sum + collection.amount, 0)

        const allReturns = salesReturns.filter((entry) => entry.customerId === customer.id)
        const periodReturns = allReturns.filter((entry) => entry.createdAt.slice(0, 7) === period)
        const returnAmount = periodReturns.reduce((sum, entry) => sum + entry.totalRefund, 0)

        // 'distributor' targets/entityId key off one specific distributor/dealer
        // customer (see SalesTargetEntityType in types.ts) — reused here for both channels.
        const target = targets.find((entry) => entry.entityType === 'distributor' && entry.entityId === customer.id && entry.period === period)
        const achievement = target && target.targetAmount > 0 ? (sales / target.targetAmount) * 100 : null

        // Commission rules only cover Sales Officer / Dealer (Section 42) — a
        // Distributor row simply has no commission concept yet.
        let commissionAmount = 0
        let commissionRuleLabel = '—'
        if (customer.customerType === 'dealer') {
          const applicableRules = activeRules.filter((rule) => rule.appliesTo === 'dealer')
          const labels: string[] = []
          for (const rule of applicableRules) {
            if (rule.ruleType === 'slab') {
              const slab = findMatchingSlab(rule.slabs, sales)
              if (slab) {
                commissionAmount += sales * (slab.percentage / 100)
                labels.push(`${rule.name} (${slab.percentage}%)`)
              }
            } else {
              const productCommission = computeProductCommission(rule, periodOrders)
              if (productCommission > 0) {
                commissionAmount += productCommission
                labels.push(rule.name)
              }
            }
          }
          commissionRuleLabel = labels.join(', ') || '—'
        }

        // Net units delivered to this dealer/distributor to date, minus units
        // they've returned — the ERP has no separate dealer-side warehouse, so
        // this stands in for "stock currently in their hands" (Section 43).
        const deliveredQty = new Map<string, { productName: string; quantity: number }>()
        for (const order of allOrders) {
          for (const item of order.items) {
            const entry = deliveredQty.get(item.productId) ?? { productName: item.productName, quantity: 0 }
            entry.quantity += item.quantity
            deliveredQty.set(item.productId, entry)
          }
        }
        for (const entry of allReturns) {
          for (const item of entry.items) {
            const existing = deliveredQty.get(item.productId)
            if (existing) existing.quantity -= item.quantity
          }
        }
        const stockBreakdown = Array.from(deliveredQty.entries())
          .map(([productId, value]) => ({ productId, productName: value.productName, quantity: Math.max(0, value.quantity) }))
          .filter((entry) => entry.quantity > 0)
          .sort((a, b) => b.quantity - a.quantity)
        const stockUnits = stockBreakdown.reduce((sum, entry) => sum + entry.quantity, 0)

        return {
          customer,
          sales,
          discount,
          collectionAmount,
          outstanding: customer.due ?? 0,
          target,
          achievement,
          returnAmount,
          commissionAmount,
          commissionRuleLabel,
          stockUnits,
          stockBreakdown,
          recentOrders: allOrders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
          recentCollections: periodCollections.length
            ? periodCollections
            : collections.filter((collection) => collection.customerId === customer.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
          recentReturns: allReturns.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
        }
      }),
    [channelCustomers, orders, collections, salesReturns, targets, activeRules, period]
  )

  const detailRow = rows.find((row) => row.customer.id === detailCustomerId)

  return (
    <AdminShell active="Dealer Management">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Dealer Management</p>
            <p className="text-xs text-muted-foreground">
              Dealer-wise Sales, Collection, Outstanding, Target, Achievement, Return, Discount, Commission, Credit Limit, and
              Stock — all in one view (Section 43).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={channelType} onValueChange={(value) => setChannelType(value as CustomerType)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNEL_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{CHANNEL_TYPE_LABEL[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="month" className="w-40" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </div>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto rounded-2xl">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>{CHANNEL_TYPE_LABEL[channelType]}</TableHead>
                    <TableHead className="text-right">Credit Limit</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Collection</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Achievement</TableHead>
                    <TableHead className="text-right">Return</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Stock (units)</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.customer.id}>
                      <TableCell>
                        <p className="font-medium">{row.customer.name}</p>
                        <p className="text-xs text-muted-foreground">{[row.customer.territory, row.customer.salesArea].filter(Boolean).join(' / ') || '—'}</p>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(row.customer.creditLimit ?? 0, currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.sales, currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.collectionAmount, currency)}</TableCell>
                      <TableCell className={cn('text-right', row.outstanding > 0 ? 'text-amber-700 dark:text-amber-400' : undefined)}>
                        {formatCurrency(row.outstanding, currency)}
                      </TableCell>
                      <TableCell className="text-right">{row.target ? formatCurrency(row.target.targetAmount, currency) : '—'}</TableCell>
                      <TableCell className="text-right">
                        {row.achievement === null ? (
                          '—'
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn(
                              'rounded-full',
                              row.achievement >= 100
                                ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                                : 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                            )}
                          >
                            {row.achievement.toFixed(1)}%
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(row.returnAmount, currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.discount, currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.commissionAmount, currency)}</TableCell>
                      <TableCell className="text-right">{row.stockUnits.toLocaleString('en-BD')}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setDetailCustomerId(row.customer.id)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
                        No {CHANNEL_TYPE_LABEL[channelType].toLowerCase()} customers found yet — add one from Customers (CRM) with that customer type.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Dialog open={Boolean(detailRow)} onOpenChange={(open) => !open && setDetailCustomerId(undefined)}>
          <DialogContent className="sm:max-w-2xl">
            {detailRow ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    {detailRow.customer.name}
                  </DialogTitle>
                  <DialogDescription>
                    {[detailRow.customer.territory, detailRow.customer.salesArea, detailRow.customer.phone].filter(Boolean).join(' • ') || 'No contact details on file.'}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MetricTile icon={Wallet} label="Sales (period)" value={formatCurrency(detailRow.sales, currency)} />
                  <MetricTile icon={CreditCard} label="Credit Limit" value={formatCurrency(detailRow.customer.creditLimit ?? 0, currency)} />
                  <MetricTile icon={TargetIcon} label="Outstanding" value={formatCurrency(detailRow.outstanding, currency)} />
                  <MetricTile icon={Percent} label="Commission" value={formatCurrency(detailRow.commissionAmount, currency)} sub={detailRow.commissionRuleLabel} />
                </div>

                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground"><Boxes className="h-4 w-4" /> Stock currently with this {CHANNEL_TYPE_LABEL[channelType].toLowerCase()}</p>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Units</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailRow.stockBreakdown.map((entry) => (
                          <TableRow key={entry.productId}>
                            <TableCell className="text-sm">{entry.productName}</TableCell>
                            <TableCell className="text-right text-sm">{entry.quantity.toLocaleString('en-BD')}</TableCell>
                          </TableRow>
                        ))}
                        {detailRow.stockBreakdown.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="h-14 text-center text-xs text-muted-foreground">No net stock delivered yet.</TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground"><Wallet className="h-4 w-4" /> Recent orders</p>
                    <ul className="space-y-1 rounded-xl border border-border/70 p-2 text-xs">
                      {detailRow.recentOrders.map((order) => (
                        <li key={order.id} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 hover:bg-muted/50">
                          <span className="text-muted-foreground">{formatDate(order.createdAt)} · {order.billNumber}</span>
                          <span className="font-medium">{formatCurrency(order.total, currency)}</span>
                        </li>
                      ))}
                      {detailRow.recentOrders.length === 0 ? <li className="p-1.5 text-muted-foreground">No orders yet.</li> : null}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground"><RotateCcw className="h-4 w-4" /> Recent returns</p>
                    <ul className="space-y-1 rounded-xl border border-border/70 p-2 text-xs">
                      {detailRow.recentReturns.map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 hover:bg-muted/50">
                          <span className="text-muted-foreground">{formatDate(entry.createdAt)} · {entry.returnNumber}</span>
                          <span className="font-medium">{formatCurrency(entry.totalRefund, currency)}</span>
                        </li>
                      ))}
                      {detailRow.recentReturns.length === 0 ? <li className="p-1.5 text-muted-foreground">No returns yet.</li> : null}
                    </ul>
                  </div>
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Award className="h-3.5 w-3.5" />
          Sales, Collection, Return, and Discount are for the selected month; Outstanding, Credit Limit, and Stock are running,
          all-time figures.
        </p>
      </div>
    </AdminShell>
  )
}

function MetricTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Wallet
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      {sub ? <p className="truncate text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  )
}
