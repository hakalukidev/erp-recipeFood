"use client"

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/erp/utils'

type EarningExpenseRow = { earning: number; expense: number; net: number } & Record<string, string | number>

type CompanyEarningsChartProps = {
  title: string
  description?: string
  data: EarningExpenseRow[]
  xKey: string
  currency?: string
  // Skips the outer Card/CardHeader frame for callers that already embed
  // this inside their own Card (the Dashboard's Company earnings summary) —
  // avoids a card-inside-a-card double border.
  bare?: boolean
}

const chart = (data: EarningExpenseRow[], xKey: string, currency?: string) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
      <YAxis tickLine={false} axisLine={false} />
      <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
      <Legend />
      <Bar dataKey="earning" name="Earning" fill="hsl(var(--chart-2))" radius={[8, 8, 0, 0]} />
      <Bar dataKey="expense" name="Expense" fill="hsl(var(--chart-3))" radius={[8, 8, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
)

// Loaded via next/dynamic({ ssr: false }) — keeps recharts out of every
// page's initial bundle except the ones that actually chart something.
// Shared by the Dashboard, and the Company Earnings page's monthly and
// yearly breakdowns — only the grouping key, labels, and frame differ.
export default function CompanyEarningsChart({ title, description, data, xKey, currency, bare }: CompanyEarningsChartProps) {
  if (bare) {
    return (
      <div>
        <p className="mb-3 text-sm font-medium text-foreground">{title}</p>
        <div className="h-72">{chart(data, xKey, currency)}</div>
      </div>
    )
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="h-80">{chart(data, xKey, currency)}</CardContent>
    </Card>
  )
}
