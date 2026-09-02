"use client"

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Ban, Phone } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { OrderRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, getReadableOrderState, sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

export function WholesaleScreen() {
  const { data, hasPermission, updateOrderStatus, cancelOrder } = useERP()
  const currency = data?.settings.currency

  const wholesaleCustomers = useMemo(
    () => toArray(data?.customers).filter((customer) => customer.isWholesale),
    [data?.customers]
  )
  const wholesaleOrders = useMemo(
    () => sortByCreatedAtDesc(toArray(data?.orders).filter((order) => order.priceMode === 'wholesale')),
    [data?.orders]
  )

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderRecord['status'] | 'all'>('all')

  const canApprove = hasPermission('orders:approve')

  const customerStats = useMemo(() => {
    return wholesaleCustomers
      .map((customer) => {
        const customerOrders = wholesaleOrders.filter((order) => order.customerId === customer.id)
        return {
          customer,
          orderCount: customerOrders.length,
          totalValue: customerOrders.reduce((sum, order) => sum + order.total, 0),
          lastOrderDate: customerOrders[0]?.createdAt ?? customer.updatedAt,
        }
      })
      .sort((left, right) => right.totalValue - left.totalValue)
  }, [wholesaleCustomers, wholesaleOrders])

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return wholesaleOrders.filter((order) => {
      const matchesSearch =
        !normalizedQuery ||
        [order.billNumber, order.customerName, ...order.items.map((item) => item.productName)]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [wholesaleOrders, query, statusFilter])

  const metrics = useMemo(
    () => ({
      customers: wholesaleCustomers.length,
      orders: wholesaleOrders.length,
      revenue: wholesaleOrders.reduce((sum, order) => sum + order.total, 0),
      due: wholesaleOrders.reduce((sum, order) => sum + order.due, 0),
    }),
    [wholesaleCustomers, wholesaleOrders]
  )

  async function handleCancelOrder(order: OrderRecord) {
    // Section 64 (Approval System): cancelling is a limited action — the
    // prompt doubles as confirmation and captures the reason for the audit trail.
    const reason = window.prompt(
      `Cancel order ${order.billNumber}? Stock will be returned to inventory and the customer's due will be adjusted.\n\nReason for cancelling (required):`
    )
    if (!reason || !reason.trim()) {
      return
    }

    await cancelOrder(order.id, reason.trim())
  }

  return (
    <AdminShell active="Wholesale">
      <div className="space-y-6">
        <Card className="border-border/70 bg-muted/20 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-muted-foreground">
              Wholesale customers are managed on the Customers page. Once a customer is marked wholesale, new sales for
              them in Sales &amp; Billing automatically default to each product&apos;s wholesale price.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/admin/customers">Manage wholesale customers</Link>
              </Button>
              <Button asChild className="rounded-xl">
                <Link href="/admin/sales">
                  New wholesale order
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Wholesale customers', metrics.customers.toLocaleString('en-BD'), 'Marked wholesale on Customers'],
            ['Wholesale orders', metrics.orders.toLocaleString('en-BD'), 'Priced at wholesale rate'],
            ['Wholesale revenue', formatCurrency(metrics.revenue, currency), 'Total across wholesale orders'],
            ['Wholesale due', formatCurrency(metrics.due, currency), 'Outstanding from wholesale orders'],
          ].map(([label, value, note]) => (
            <Card key={label} className="border-border/70 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Wholesale customers</CardTitle>
            <CardDescription>Ranked by total wholesale order value.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Customer</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Total value</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Last order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerStats.map(({ customer, orderCount, totalValue, lastOrderDate }) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <p className="font-semibold">{customer.name}</p>
                        <p className="text-sm text-muted-foreground">{customer.company}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {customer.phone}
                        </div>
                      </TableCell>
                      <TableCell>{orderCount}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(totalValue, currency)}</TableCell>
                      <TableCell className={cn(customer.due > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : '')}>
                        {formatCurrency(customer.due, currency)}
                      </TableCell>
                      <TableCell>{orderCount ? formatDate(lastOrderDate) : 'No orders yet'}</TableCell>
                    </TableRow>
                  ))}
                  {customerStats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                        No wholesale customers yet. Mark a customer as wholesale from the Customers page.
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
            <div>
              <CardTitle>Wholesale orders</CardTitle>
              <CardDescription>Every order recorded at wholesale pricing.</CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search bill, customer, product" />
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Bill</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id} className={cn(order.due > 0 ? 'bg-rose-500/5 dark:bg-rose-500/10' : '')}>
                      <TableCell className="font-medium">{order.billNumber}</TableCell>
                      <TableCell>{order.customerName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {order.items.map((item) => `${item.productName} x${item.quantity}`).join(', ')}
                      </TableCell>
                      <TableCell>{formatCurrency(order.total, currency)}</TableCell>
                      <TableCell className={cn(order.due > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : '')}>
                        {formatCurrency(order.due, currency)}
                      </TableCell>
                      <TableCell>
                        {order.status === 'cancelled' ? (
                          <Badge variant="outline" className="border-rose-500/40 text-rose-600 dark:text-rose-400">Cancelled</Badge>
                        ) : canApprove ? (
                          <Select value={order.status} onValueChange={(value) => void updateOrderStatus(order.id, value as OrderRecord['status'])}>
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="ready">Ready</SelectItem>
                              <SelectItem value="shipped">Shipped</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="hold">Hold</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline">{getReadableOrderState(order)}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(order.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {canApprove && order.status !== 'cancelled' ? (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-rose-600 hover:text-rose-600 dark:text-rose-400"
                            onClick={() => void handleCancelOrder(order)}
                            aria-label={`Cancel order ${order.billNumber}`}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                        No wholesale orders match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
