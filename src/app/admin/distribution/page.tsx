"use client"

import { useMemo, useState } from 'react'
import {
  ArrowDown,
  Building2,
  Factory,
  ShoppingBasket,
  Store,
  Users,
  Wallet,
} from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { CustomerType, OrderRecord } from '@/lib/erp/types'
import { formatCurrency, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

// order.total includes VAT (not revenue) — mirrors getOrderNetSales in the
// Finance/Accounting, Sales Force, and Dealer Management pages.
function getOrderNetSales(order: OrderRecord) {
  return order.total - (order.vat ?? 0)
}

function monthInputValue(date = new Date()) {
  return date.toISOString().slice(0, 7)
}

type LevelId = 'distributor' | 'dealer' | 'retailer' | 'consumer'

const LEVELS: Array<{ id: LevelId; label: string; icon: typeof Building2; description: string }> = [
  { id: 'distributor', label: 'Distributor', icon: Factory, description: 'Buys directly from the company in bulk' },
  { id: 'dealer', label: 'Dealer', icon: Building2, description: 'Buys from a Distributor (or the company) and supplies Retailers' },
  { id: 'retailer', label: 'Retailer', icon: Store, description: 'Shop-front sales to end Consumers' },
  { id: 'consumer', label: 'Consumer', icon: Users, description: "Buys at the Retailer's counter — outside the ERP's customer ledger" },
]

// Customer records without an explicit type (legacy data) fall back to
// 'retailer', same convention as the customerTypeLabels default on the
// Customers (CRM) page.
function levelForCustomerType(customerType: CustomerType | undefined): LevelId | 'other' {
  if (customerType === 'distributor') return 'distributor'
  if (customerType === 'dealer') return 'dealer'
  if (customerType === 'retailer' || !customerType) return 'retailer'
  return 'other'
}

export default function DistributionManagementPage() {
  const { data } = useERP()
  const currency = data?.settings.currency
  const [period, setPeriod] = useState(monthInputValue())

  const customers = useMemo(() => toArray(data?.customers), [data?.customers])
  const orders = useMemo(
    () => toArray(data?.orders).filter((order) => order.status !== 'cancelled' && order.createdAt.slice(0, 7) === period),
    [data?.orders, period]
  )
  const collections = useMemo(
    () => toArray(data?.collections).filter((collection) => collection.collectionDate.slice(0, 7) === period),
    [data?.collections, period]
  )

  const companySales = useMemo(() => orders.reduce((sum, order) => sum + getOrderNetSales(order), 0), [orders])

  const levelStats = useMemo(() => {
    const stats = new Map<LevelId | 'other', { customerCount: number; sales: number; collection: number; outstanding: number }>()
    for (const level of [...LEVELS.map((entry) => entry.id), 'other' as const]) {
      stats.set(level, { customerCount: 0, sales: 0, collection: 0, outstanding: 0 })
    }

    for (const customer of customers) {
      const level = levelForCustomerType(customer.customerType)
      if (level === 'consumer') continue // consumers have no customer record
      const bucket = stats.get(level)!
      bucket.customerCount += 1
      bucket.outstanding += customer.due ?? 0
    }
    for (const order of orders) {
      const customer = data?.customers[order.customerId]
      const level = levelForCustomerType(customer?.customerType)
      if (level === 'consumer') continue
      stats.get(level)!.sales += getOrderNetSales(order)
    }
    for (const collection of collections) {
      const customer = data?.customers[collection.customerId]
      const level = levelForCustomerType(customer?.customerType)
      if (level === 'consumer') continue
      stats.get(level)!.collection += collection.amount
    }
    return stats
  }, [customers, orders, collections, data?.customers])

  const otherStats = levelStats.get('other')!

  return (
    <AdminShell active="Distribution Management">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Distribution Management</p>
            <p className="text-xs text-muted-foreground">
              Company → Distributor → Dealer → Retailer → Consumer — sales tracked at every level (Section 44).
            </p>
          </div>
          <Input type="month" className="w-40" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="flex flex-col items-center gap-2 p-6">
            <HierarchyNode icon={ShoppingBasket} label="Company" sales={companySales} currency={currency} highlight />
            {LEVELS.map((level) => {
              const stats = levelStats.get(level.id)!
              return (
                <div key={level.id} className="flex w-full flex-col items-center gap-2">
                  <ArrowDown className="h-4 w-4 text-muted-foreground" />
                  <HierarchyNode
                    icon={level.icon}
                    label={level.label}
                    description={level.description}
                    sales={level.id === 'consumer' ? null : stats.sales}
                    customerCount={level.id === 'consumer' ? null : stats.customerCount}
                    currency={currency}
                  />
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto rounded-2xl">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Level</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">% of Company Sales</TableHead>
                    <TableHead className="text-right">Collection</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell className="font-medium">Company (all channels)</TableCell>
                    <TableCell className="text-right">{customers.length}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(companySales, currency)}</TableCell>
                    <TableCell className="text-right">100.0%</TableCell>
                    <TableCell className="text-right">{formatCurrency(collections.reduce((sum, c) => sum + c.amount, 0), currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(customers.reduce((sum, c) => sum + (c.due ?? 0), 0), currency)}</TableCell>
                  </TableRow>
                  {LEVELS.map((level) => {
                    const stats = levelStats.get(level.id)!
                    const share = companySales > 0 ? (stats.sales / companySales) * 100 : 0
                    return (
                      <TableRow key={level.id}>
                        <TableCell className="font-medium">{level.label}</TableCell>
                        <TableCell className="text-right">{level.id === 'consumer' ? '—' : stats.customerCount}</TableCell>
                        <TableCell className="text-right">
                          {level.id === 'consumer' ? (
                            <span className="text-xs text-muted-foreground">Not tracked separately</span>
                          ) : (
                            formatCurrency(stats.sales, currency)
                          )}
                        </TableCell>
                        <TableCell className="text-right">{level.id === 'consumer' ? '—' : `${share.toFixed(1)}%`}</TableCell>
                        <TableCell className="text-right">{level.id === 'consumer' ? '—' : formatCurrency(stats.collection, currency)}</TableCell>
                        <TableCell className="text-right">{level.id === 'consumer' ? '—' : formatCurrency(stats.outstanding, currency)}</TableCell>
                      </TableRow>
                    )
                  })}
                  {otherStats.customerCount > 0 ? (
                    <TableRow>
                      <TableCell>
                        <p className="font-medium">Other (Wholesaler / Corporate)</p>
                        <p className="text-xs text-muted-foreground">Outside the Distributor–Dealer–Retailer chain</p>
                      </TableCell>
                      <TableCell className="text-right">{otherStats.customerCount}</TableCell>
                      <TableCell className="text-right">{formatCurrency(otherStats.sales, currency)}</TableCell>
                      <TableCell className="text-right">{companySales > 0 ? `${((otherStats.sales / companySales) * 100).toFixed(1)}%` : '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(otherStats.collection, currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(otherStats.outstanding, currency)}</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          Consumer-level sales aren&apos;t tracked separately — a Retailer&apos;s counter sale to a walk-in consumer is
          recorded once, as that Retailer&apos;s sale, above.
        </p>
      </div>
    </AdminShell>
  )
}

function HierarchyNode({
  icon: Icon,
  label,
  description,
  sales,
  customerCount,
  currency,
  highlight,
}: {
  icon: typeof Building2
  label: string
  description?: string
  sales: number | null
  customerCount?: number | null
  currency?: string
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'flex w-full max-w-md items-center gap-3 rounded-2xl border p-3',
        highlight ? 'border-primary/40 bg-primary/5' : 'border-border/70 bg-muted/20'
      )}
    >
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', highlight ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          {typeof customerCount === 'number' ? (
            <Badge variant="outline" className="rounded-full text-[10px]">{customerCount} customer{customerCount === 1 ? '' : 's'}</Badge>
          ) : null}
        </div>
        {description ? <p className="truncate text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <p className="shrink-0 text-sm font-semibold text-foreground">{sales === null ? '—' : formatCurrency(sales, currency)}</p>
    </div>
  )
}
