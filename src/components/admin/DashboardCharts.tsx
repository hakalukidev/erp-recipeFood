"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  buildCategoryRevenue,
  buildRevenueSeries,
  formatCurrency,
  REVENUE_RANGE_OPTIONS,
  RevenueRange,
} from '@/lib/erp/utils'

type StatusSlice = { status: string; total: number; color: string }

type DashboardChartsProps = {
  revenueSeries: ReturnType<typeof buildRevenueSeries>
  categoryRevenue: ReturnType<typeof buildCategoryRevenue>
  orderStatusData: StatusSlice[]
  paymentStatusData: StatusSlice[]
  revenueRange: RevenueRange
  onRevenueRangeChange: (range: RevenueRange) => void
  currency?: string
}

// Pulled out of DashboardScreen and loaded via next/dynamic({ ssr: false })
// so recharts (and its own dependency tree) isn't part of the Dashboard's
// initial JS bundle — the Dashboard is the first page almost every session
// hits, so this is the highest-value lazy-load target in the app.
export default function DashboardCharts({
  revenueSeries,
  categoryRevenue,
  orderStatusData,
  paymentStatusData,
  revenueRange,
  onRevenueRangeChange,
  currency,
}: DashboardChartsProps) {
  const rangeLabel = REVENUE_RANGE_OPTIONS.find((option) => option.value === revenueRange)?.label.toLowerCase()

  return (
    <>
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Revenue vs expense</CardTitle>
            <CardDescription>Order revenue against purchase spend over the selected period.</CardDescription>
          </div>
          <Select value={revenueRange} onValueChange={(value) => onRevenueRangeChange(value as RevenueRange)}>
            <SelectTrigger className="w-40 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REVENUE_RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueSeries}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={3} />
              <Line type="monotone" dataKey="expense" stroke="hsl(var(--chart-3))" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Order status mix</CardTitle>
            <CardDescription>Share of orders currently in each pipeline stage.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {orderStatusData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={orderStatusData}
                    dataKey="total"
                    nameKey="status"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={2}
                    cornerRadius={4}
                  >
                    {orderStatusData.map((entry) => (
                      <Cell key={entry.status} fill={entry.color} stroke="hsl(var(--card))" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={36} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No orders recorded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Order volume</CardTitle>
            <CardDescription>Number of orders placed over {rangeLabel}.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueSeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="orders" fill="hsl(var(--chart-4))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Revenue by category</CardTitle>
            <CardDescription>Top product categories by revenue over {rangeLabel}.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {categoryRevenue.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryRevenue} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis dataKey="category" type="category" tickLine={false} axisLine={false} width={110} />
                  <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
                  <Bar dataKey="revenue" radius={[0, 8, 8, 0]}>
                    {categoryRevenue.map((entry, index) => (
                      <Cell key={entry.category} fill={`hsl(var(--chart-${(index % 5) + 1}))`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No sales recorded for this period.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Payment status mix</CardTitle>
            <CardDescription>Share of orders by payment status.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {paymentStatusData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentStatusData}
                    dataKey="total"
                    nameKey="status"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={2}
                    cornerRadius={4}
                  >
                    {paymentStatusData.map((entry) => (
                      <Cell key={entry.status} fill={entry.color} stroke="hsl(var(--card))" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={36} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No orders recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
