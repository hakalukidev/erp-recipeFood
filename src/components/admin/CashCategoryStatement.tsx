"use client"

import { useMemo, useState } from 'react'
import { FileText } from 'lucide-react'

import { RecordApprovalTag } from '@/components/admin/ApprovalStatusBadge'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CASH_IN_CATEGORIES } from '@/lib/erp/standardChartOfAccounts'
import type { CashMaintenanceRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, isCashMaintenanceIn } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

// Per-category (বিভাগ) statement for the Cash Maintenance chart (2026-10-02
// client spec §4: "ক্যাশ মেইনটেনেন্সের প্রতিটি বিভাগের আলাদা আলাদা স্টেটমেন্ট").
// Works like a ledger account statement for one category: everything recorded
// under it before the From date is carried in as the opening (cumulative)
// total, then each entry in the range is listed with a running total, ending
// in the closing cumulative total. The "All categories" view puts one line
// per category side by side (opening / this period / closing), and its export
// writes every category's statement into one file, section by section.
// Rejected entries never count; pending ones count but are tagged, same as
// the totals on the rest of the page.

const ALL = '__all__'

const dhakaDateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' })

function particulars(entry: CashMaintenanceRecord) {
  return [entry.employeeName, entry.productReturnNumber ? `Return ${entry.productReturnNumber}` : '', entry.note]
    .filter(Boolean)
    .join(' · ')
}

type CategoryStatement = {
  category: string
  direction: 'in' | 'out'
  opening: number
  entries: Array<{ entry: CashMaintenanceRecord; running: number }>
  periodTotal: number
  closing: number
}

export function CashCategoryStatement({
  entries,
  categoryOptions,
  currency,
}: {
  entries: CashMaintenanceRecord[]
  // The chart's own category list (cash-out options); cash-in categories and
  // any older category found on a saved entry are added automatically.
  categoryOptions: string[]
  currency?: string
}) {
  const today = dhakaDateFormat.format(new Date())
  const [category, setCategory] = useState<string>(ALL)
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`)
  const [to, setTo] = useState(today)

  const countedEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.approvalStatus !== 'rejected')
        .sort((left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt)),
    [entries]
  )

  const { outCategories, inCategories } = useMemo(() => {
    const inSet = new Set<string>(CASH_IN_CATEGORIES)
    const outSet = new Set<string>(categoryOptions)
    for (const entry of countedEntries) {
      if (isCashMaintenanceIn(entry)) inSet.add(entry.category)
      else outSet.add(entry.category)
    }
    return { outCategories: Array.from(outSet), inCategories: Array.from(inSet) }
  }, [countedEntries, categoryOptions])

  const statements = useMemo<CategoryStatement[]>(() => {
    const build = (name: string, direction: 'in' | 'out'): CategoryStatement => {
      const own = countedEntries.filter(
        (entry) => entry.category === name && (isCashMaintenanceIn(entry) ? 'in' : 'out') === direction
      )
      const opening = own.filter((entry) => entry.date.slice(0, 10) < from).reduce((sum, entry) => sum + entry.amount, 0)
      let running = opening
      const inRange = own
        .filter((entry) => entry.date.slice(0, 10) >= from && entry.date.slice(0, 10) <= to)
        .map((entry) => {
          running += entry.amount
          return { entry, running }
        })
      return { category: name, direction, opening, entries: inRange, periodTotal: running - opening, closing: running }
    }
    return [
      ...outCategories.map((name) => build(name, 'out')),
      ...inCategories.map((name) => build(name, 'in')),
    ]
  }, [countedEntries, outCategories, inCategories, from, to])

  const selected = category === ALL ? null : statements.find((row) => `${row.direction}:${row.category}` === category) ?? null
  const rangeLabel = `${formatDate(from)} – ${formatDate(to)}`
  const invalidRange = from > to

  const statementRows = (statement: CategoryStatement): (string | number)[][] => [
    ['', `Opening (before ${from})`, '', statement.opening],
    ...statement.entries.map(({ entry, running }) => [
      entry.date.slice(0, 10),
      particulars(entry) || '-',
      entry.amount,
      running,
    ]),
    ['', 'Total this period', statement.periodTotal, ''],
    ['', 'Closing (cumulative)', '', statement.closing],
  ]

  const exportProps = selected
    ? {
        filenameBase: `cash-statement-${selected.category}-${from}-to-${to}`,
        title: `${selected.category} — Statement (${rangeLabel})`,
        headers: ['Date', 'Particulars', 'Amount', 'Running Total'],
        rows: statementRows(selected),
      }
    : {
        filenameBase: `cash-statement-all-categories-${from}-to-${to}`,
        title: `Cash Maintenance — Category Statements (${rangeLabel})`,
        headers: ['Date', 'Particulars', 'Amount', 'Running Total'],
        // One section per category that has any activity up to `to`.
        rows: statements
          .filter((statement) => statement.closing !== 0)
          .flatMap((statement) => [
            [`${statement.category} (${statement.direction === 'in' ? 'Cash In' : 'Cash Out'})`, '', '', ''],
            ...statementRows(statement),
            ['', '', '', ''],
          ]),
      }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Category Statement — বিভাগভিত্তিক স্টেটমেন্ট
          </CardTitle>
          <CardDescription>
            প্রতিটি বিভাগের আলাদা স্টেটমেন্ট: আগের জমা (opening), এই সময়ের প্রতিটি এন্ট্রি ও রানিং টোটাল, এবং মোট (closing)।
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories (summary)</SelectItem>
              <SelectGroup>
                <SelectLabel>Cash Out</SelectLabel>
                {outCategories.map((name) => (
                  <SelectItem key={`out:${name}`} value={`out:${name}`}>{name}</SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Cash In</SelectLabel>
                {inCategories.map((name) => (
                  <SelectItem key={`in:${name}`} value={`in:${name}`}>{name}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input className="w-40" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} aria-label="From date" />
          <Input className="w-40" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} aria-label="To date" />
          <ExportMenu {...exportProps} disabled={invalidRange} />
        </div>
      </CardHeader>
      <CardContent>
        {invalidRange ? (
          <p className="text-sm text-destructive">From date must be on or before To date.</p>
        ) : selected ? (
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Date</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Running Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableCell />
                  <TableCell className="font-medium">Opening — {formatDate(from)} এর আগ পর্যন্ত মোট</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-medium tabular-nums">{formatCurrency(selected.opening, currency)}</TableCell>
                </TableRow>
                {selected.entries.map(({ entry, running }) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.date)}</TableCell>
                    <TableCell className="text-sm">
                      {particulars(entry) || <span className="text-muted-foreground">-</span>}
                      <RecordApprovalTag record={entry} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(entry.amount, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(running, currency)}</TableCell>
                  </TableRow>
                ))}
                {selected.entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      No entries in this category for {rangeLabel}.
                    </TableCell>
                  </TableRow>
                ) : null}
                <TableRow className="font-semibold">
                  <TableCell />
                  <TableCell>Total this period ({selected.entries.length} entries)</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(selected.periodTotal, currency)}</TableCell>
                  <TableCell />
                </TableRow>
                <TableRow className="bg-primary/5 font-semibold hover:bg-primary/5">
                  <TableCell />
                  <TableCell>Closing — {formatDate(to)} পর্যন্ত মোট</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{formatCurrency(selected.closing, currency)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">This period</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.map((statement) => (
                  <TableRow
                    key={`${statement.direction}:${statement.category}`}
                    className="cursor-pointer"
                    onClick={() => setCategory(`${statement.direction}:${statement.category}`)}
                  >
                    <TableCell className="font-medium">
                      {statement.category}
                      {statement.direction === 'in' ? (
                        <Badge variant="outline" className="ml-2 rounded-full border-emerald-300 text-[10px] text-emerald-700 dark:text-emerald-300">
                          Cash In
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(statement.opening, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{statement.entries.length}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', statement.periodTotal === 0 && 'text-muted-foreground')}>
                      {formatCurrency(statement.periodTotal, currency)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(statement.closing, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
              Click a category to open its full statement.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
