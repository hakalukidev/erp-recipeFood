"use client"

import { useMemo, useState } from 'react'
import { BadgePercent, FileBarChart, Package, Receipt, Search, Store } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { ExportMenu } from './ExportMenu'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import { buildSalesReportSummary, formatCurrency } from '@/lib/erp/utils'

// Section — Sales Reports. Built entirely off saved Invoices (RateCardRecord,
// see the "Invoice" screen at /admin/rate-card) — the only sales document
// actually reachable from the UI today. See buildSalesReportSummary in
// utils.ts for how the dealer/product/commission-vs-others numbers below are
// derived, and the "Sale type" field on the Invoice form for how a new
// invoice gets tagged Commission-based vs Others going forward.
export function SalesReportsScreen() {
  const { data } = useERP()
  const currency = data?.settings.currency
  const summary = useMemo(() => buildSalesReportSummary(data), [data])

  const [dealerQuery, setDealerQuery] = useState('')
  const [productQuery, setProductQuery] = useState('')

  const filteredDealers = useMemo(() => {
    const normalized = dealerQuery.trim().toLowerCase()
    if (!normalized) return summary.dealers
    return summary.dealers.filter((row) => row.dealerName.toLowerCase().includes(normalized))
  }, [summary.dealers, dealerQuery])

  const filteredProducts = useMemo(() => {
    const normalized = productQuery.trim().toLowerCase()
    if (!normalized) return summary.products
    return summary.products.filter((row) => row.productName.toLowerCase().includes(normalized))
  }, [summary.products, productQuery])

  const hasUnclassified = summary.bySaleType.unclassified > 0

  return (
    <AdminShell active="Sales Reports">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Receipt className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Total sales</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(summary.totalAmount, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{summary.totalInvoices.toLocaleString('en-BD')} invoice(s)</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <BadgePercent className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Commission-based sales</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(summary.bySaleType.commission, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Invoices marked Commission-based</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Store className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Others / direct sales</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(summary.bySaleType.others, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Invoices marked Others / Direct</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileBarChart className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Unclassified sales</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(summary.bySaleType.unclassified, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Invoices saved before Sale Type existed</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Dealer-wise sales report</CardTitle>
              <CardDescription>Search a dealer to see their total invoiced sales, split by sale type.</CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={dealerQuery}
                  onChange={(event) => setDealerQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search dealer"
                />
              </div>
              <ExportMenu
                filenameBase="dealer-sales-report"
                title="Dealer-wise Sales Report"
                headers={['Dealer', 'Invoices', 'Commission-based', 'Others', 'Unclassified', 'Total']}
                rows={filteredDealers.map((row) => [
                  row.dealerName,
                  row.invoiceCount,
                  row.commissionAmount.toFixed(2),
                  row.othersAmount.toFixed(2),
                  row.unclassifiedAmount.toFixed(2),
                  row.totalAmount.toFixed(2),
                ])}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dealer</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Commission-based</TableHead>
                    <TableHead className="text-right">Others</TableHead>
                    {hasUnclassified ? <TableHead className="text-right">Unclassified</TableHead> : null}
                    <TableHead className="text-right">Total sale amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDealers.map((row) => (
                    <TableRow key={row.dealerId}>
                      <TableCell className="font-medium">{row.dealerName}</TableCell>
                      <TableCell className="text-right">{row.invoiceCount.toLocaleString('en-BD')}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.commissionAmount, currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.othersAmount, currency)}</TableCell>
                      {hasUnclassified ? (
                        <TableCell className="text-right">{formatCurrency(row.unclassifiedAmount, currency)}</TableCell>
                      ) : null}
                      <TableCell className="text-right font-semibold">{formatCurrency(row.totalAmount, currency)}</TableCell>
                    </TableRow>
                  ))}
                  {filteredDealers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={hasUnclassified ? 6 : 5} className="py-10 text-center text-sm text-muted-foreground">
                        <Store className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        {summary.dealers.length === 0 ? 'No invoiced sales yet.' : 'No dealer matches this search.'}
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
              <CardTitle>Product-wise sales report</CardTitle>
              <CardDescription>Total quantity and amount sold per product, across every invoice.</CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search product"
                />
              </div>
              <ExportMenu
                filenameBase="product-sales-report"
                title="Product-wise Sales Report"
                headers={['Product', 'Quantity sold (pcs)', 'Total sale amount']}
                rows={filteredProducts.map((row) => [row.productName, row.qty, row.totalAmount.toFixed(2)])}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity sold (pcs)</TableHead>
                    <TableHead className="text-right">Total sale amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell className="text-right">{row.qty.toLocaleString('en-BD')}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.totalAmount, currency)}</TableCell>
                    </TableRow>
                  ))}
                  {filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                        <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        {summary.products.length === 0 ? 'No invoiced sales yet.' : 'No product matches this search.'}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {hasUnclassified ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-normal">Unclassified</Badge>
            Invoices saved before the Sale Type field was added — edit and re-save one from the Invoice screen to classify it.
          </p>
        ) : null}
      </div>
    </AdminShell>
  )
}
