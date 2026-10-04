"use client"

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, ExternalLink, History, PencilLine, Search, ShieldCheck, XCircle } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { ApprovalStatusBadge } from '@/components/admin/ApprovalStatusBadge'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  APPROVAL_DEPARTMENT_LABELS,
  buildApprovalQueue,
  type ApprovalCollection,
  type ApprovalDepartment,
  type ApprovalQueueItem,
} from '@/lib/erp/approvals'
import { useERP } from '@/lib/erp/provider'
import type { RecordApprovalStatus } from '@/lib/erp/types'
import { dhakaTodayIso, expenseCategoryLabel, formatCurrency, formatDate, formatDateTime } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

// Input & Authorization (client spec, 2026-09-25): one place where every
// department's submitted entries wait for authorization. Approvers see
// the entries their `<module>:approve` permissions cover and can approve or
// reject them; everyone else sees the status of the entries they submitted
// themselves. Expenses keep their own pre-existing approval flow
// (updateExpenseApproval) but are listed here too so nothing is missed.

type QueueRow = Omit<ApprovalQueueItem, 'collection'> & {
  collection: ApprovalCollection | 'expenses'
}

type StatusFilter = RecordApprovalStatus | 'all'

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

const DEPARTMENT_LABELS: Record<ApprovalDepartment | 'expenses', string> = {
  ...APPROVAL_DEPARTMENT_LABELS,
  expenses: 'Finance',
}

export default function ApprovalsPage() {
  const { data, currentUser, hasPermission, reviewRecordApproval, updateExpenseApproval } = useERP()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [departmentFilter, setDepartmentFilter] = useState<ApprovalDepartment | 'all'>('all')
  const [query, setQuery] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  // Status change that needs a confirm dialog: any rejection (reason
  // required) and any change to an already-reviewed entry.
  const [changing, setChanging] = useState<{ row: QueueRow; status: RecordApprovalStatus } | null>(null)
  const [changeNote, setChangeNote] = useState('')
  const currency = data?.settings.currency

  // Period filter (2026-10-04 client request) on the entry's own date.
  // Defaults to All time so an old pending entry is never hidden.
  const [periodMode, setPeriodMode] = useState<'all' | 'monthly' | 'daily'>('all')
  const [periodMonth, setPeriodMonth] = useState(() => dhakaTodayIso().slice(0, 7))
  const [periodDay, setPeriodDay] = useState(() => dhakaTodayIso())
  const periodLabel =
    periodMode === 'monthly' && periodMonth
      ? new Date(`${periodMonth}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : periodMode === 'daily' && periodDay
        ? formatDate(periodDay)
        : 'All time'

  const allRows = useMemo<QueueRow[]>(() => {
    const rows: QueueRow[] = buildApprovalQueue(data)

    // Expenses: normalizeExpenseRecord marks legacy ones "approved" with no
    // reviewer, so only list the ones that actually went through review.
    Object.values(data?.expenses ?? {}).forEach((expense) => {
      if (expense.approvalStatus !== 'pending' && !expense.approvedAt) {
        return
      }
      rows.push({
        key: `expenses:${expense.id}`,
        collection: 'expenses',
        recordId: expense.id,
        department: 'finance',
        label: 'Expense',
        permission: 'finance:approve',
        href: '/admin/finance',
        status: expense.approvalStatus,
        reference: expenseCategoryLabel(data, expense.category),
        party: expense.employeeName || expense.loanMemberName || '—',
        amount: expense.amount,
        date: expense.date,
        detail: expense.note ?? '',
        submittedBy: expense.createdBy,
        submittedByName: expense.createdByName,
        submittedAt: expense.createdAt,
        approvedByName: expense.approvedByName,
        approvedAt: expense.approvedAt,
        approvalNote: '',
      })
    })

    return rows.sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
  }, [data])

  // What this user may see: anything their approve permissions cover, plus
  // their own submissions.
  const visibleRows = useMemo(
    () =>
      allRows.filter((row) => {
        if (!hasPermission(row.permission) && row.submittedBy !== currentUser?.id) return false
        const day = (row.date || row.submittedAt).slice(0, 10)
        if (periodMode === 'monthly' && periodMonth) return day.slice(0, 7) === periodMonth
        if (periodMode === 'daily' && periodDay) return day === periodDay
        return true
      }),
    [allRows, currentUser?.id, hasPermission, periodMode, periodMonth, periodDay]
  )

  const counts = useMemo(() => {
    const result: Record<RecordApprovalStatus, number> = { pending: 0, approved: 0, rejected: 0 }
    visibleRows.forEach((row) => {
      result[row.status] += 1
    })
    return result
  }, [visibleRows])
  const amounts = useMemo(() => {
    const result: Record<RecordApprovalStatus, number> = { pending: 0, approved: 0, rejected: 0 }
    visibleRows.forEach((row) => {
      result[row.status] += row.amount || 0
    })
    return result
  }, [visibleRows])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return visibleRows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (departmentFilter !== 'all' && row.department !== departmentFilter) return false
      if (!needle) return true
      return [row.label, row.reference, row.party, row.detail, row.submittedByName]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [departmentFilter, query, statusFilter, visibleRows])

  const isApprover = useMemo(() => allRows.some((row) => hasPermission(row.permission)), [allRows, hasPermission])

  // Any status can be changed by an approver — a mistaken approval or
  // rejection is fixed from here (see reviewRecordApproval).
  function canReview(row: QueueRow) {
    if (!hasPermission(row.permission)) return false
    // Maker-checker: nobody but Super Admin authorizes their own entry
    // (enforced again in reviewRecordApproval).
    return row.submittedBy !== currentUser?.id || currentUser?.roleId === 'super_admin'
  }

  async function review(row: QueueRow, status: RecordApprovalStatus, note?: string) {
    setBusyKey(row.key)
    setFeedback(null)
    try {
      if (row.collection === 'expenses') {
        await updateExpenseApproval(row.recordId, status)
      } else {
        await reviewRecordApproval(row.collection, row.recordId, status, note)
      }
      setFeedback(
        row.status === 'pending'
          ? `${row.label} ${row.reference} ${status}.`
          : `${row.label} ${row.reference} changed from ${row.status} to ${status}.`
      )
      return true
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to update this entry.')
      return false
    } finally {
      setBusyKey(null)
    }
  }

  function openChange(row: QueueRow, status: RecordApprovalStatus) {
    setChangeNote('')
    setChanging({ row, status })
  }

  async function confirmChange() {
    if (!changing) return
    if (changing.status === 'rejected' && changing.row.collection !== 'expenses' && !changeNote.trim()) {
      setFeedback('Give a reason for rejecting this entry.')
      return
    }
    const done = await review(changing.row, changing.status, changeNote)
    if (done) {
      setChanging(null)
      setChangeNote('')
    }
  }

  const STATUS_LABEL: Record<RecordApprovalStatus, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }

  const exportHeaders = ['Submitted', 'Department', 'Type', 'Reference', 'Party', 'Amount', 'Entered by', 'Status', 'Authorized by', 'Note']
  const exportRows = filteredRows.map((row) => [
    formatDateTime(row.submittedAt),
    DEPARTMENT_LABELS[row.department],
    row.label,
    row.reference,
    row.party,
    row.amount ? row.amount.toFixed(2) : '',
    row.submittedByName,
    row.status,
    row.approvedByName,
    row.approvalNote,
  ])

  return (
    <AdminShell active="Approvals">
      <div className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Period:</span>
              <span className="text-muted-foreground">{periodLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={periodMode} onValueChange={(value) => setPeriodMode(value as typeof periodMode)}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
              {periodMode === 'monthly' ? (
                <Input className="w-full sm:w-44" type="month" value={periodMonth} onChange={(event) => setPeriodMonth(event.target.value)} aria-label="Month" />
              ) : null}
              {periodMode === 'daily' ? (
                <Input className="w-full sm:w-44" type="date" value={periodDay} onChange={(event) => setPeriodDay(event.target.value)} aria-label="Day" />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          {(['pending', 'approved', 'rejected'] as const).map((status) => (
            <Card key={status} className="border-border/70 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">
                  {status === 'pending' ? 'Waiting for authorization' : status === 'approved' ? 'Approved' : 'Rejected'}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{counts[status].toLocaleString('en-BD')}</p>
                <p className="mt-1 text-sm font-medium tabular-nums">{formatCurrency(amounts[status], currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {periodLabel} · {isApprover ? 'entries you can see across departments' : 'entries you submitted'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Input &amp; Authorization
                </CardTitle>
                <CardDescription>
                  Every department entry is saved as pending and becomes final once an approver authorizes it.
                  Approved entries are locked — only an approver can change them. An approver can also change the status of an
                  already approved or rejected entry (e.g. one approved by mistake) from its row&apos;s Change status menu.
                </CardDescription>
              </div>
              <ExportMenu filenameBase="approvals" title={`Input & Authorization — ${periodLabel}`} headers={exportHeaders} rows={exportRows} />
            </div>

            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map((tab) => (
                <Button
                  key={tab.value}
                  variant={statusFilter === tab.value ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setStatusFilter(tab.value)}
                >
                  {tab.label}
                  {tab.value !== 'all' ? <span className="ml-1.5 opacity-70">{counts[tab.value]}</span> : null}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search reference, party, or who entered it"
                />
              </div>
              <Select value={departmentFilter} onValueChange={(value) => setDepartmentFilter(value as ApprovalDepartment | 'all')}>
                <SelectTrigger>
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {(Object.keys(APPROVAL_DEPARTMENT_LABELS) as ApprovalDepartment[]).map((department) => (
                    <SelectItem key={department} value={department}>
                      {APPROVAL_DEPARTMENT_LABELS[department]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Date</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Entered by</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
                      <TableCell>
                        <p className="font-medium">{DEPARTMENT_LABELS[row.department]}</p>
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <p className="font-semibold">{row.reference}</p>
                        <p className="text-xs text-muted-foreground">
                          {[row.party !== '—' ? row.party : '', row.detail].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {row.amount ? formatCurrency(row.amount, currency) : '—'}
                      </TableCell>
                      <TableCell>
                        <p>{row.submittedByName || '—'}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(row.submittedAt)}</p>
                      </TableCell>
                      <TableCell className="min-w-40">
                        <ApprovalStatusBadge status={row.status} />
                        {row.status !== 'pending' && row.approvedByName ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            by {row.approvedByName}
                            {row.approvedAt ? `, ${formatDateTime(row.approvedAt)}` : ''}
                          </p>
                        ) : null}
                        {row.approvalNote ? (
                          <p className={cn('mt-1 text-xs', row.status === 'rejected' ? 'text-destructive' : 'text-muted-foreground')}>
                            {row.approvalNote}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {canReview(row) && row.status === 'pending' ? (
                            <>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-emerald-600 hover:text-emerald-600"
                                disabled={busyKey === row.key}
                                onClick={() => void review(row, 'approved')}
                                aria-label={`Approve ${row.label} ${row.reference}`}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                disabled={busyKey === row.key}
                                onClick={() => openChange(row, 'rejected')}
                                aria-label={`Reject ${row.label} ${row.reference}`}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          ) : null}
                          {canReview(row) && row.status !== 'pending' ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" disabled={busyKey === row.key}>
                                  <PencilLine className="mr-2 h-4 w-4" /> Change status
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Currently {STATUS_LABEL[row.status].toLowerCase()}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {row.status !== 'approved' ? (
                                  <DropdownMenuItem onClick={() => openChange(row, 'approved')}>
                                    <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> Change to Approved
                                  </DropdownMenuItem>
                                ) : null}
                                {row.status !== 'rejected' ? (
                                  <DropdownMenuItem onClick={() => openChange(row, 'rejected')}>
                                    <XCircle className="mr-2 h-4 w-4 text-destructive" /> Change to Rejected
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem onClick={() => openChange(row, 'pending')}>
                                  <History className="mr-2 h-4 w-4" /> Send back to Pending
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                          <Button variant="outline" size="icon" className="h-9 w-9" asChild>
                            <Link href={row.href} aria-label={`Open ${row.label} page`}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                        {statusFilter === 'pending' ? `Nothing is waiting for authorization (${periodLabel}).` : `No entries found (${periodLabel}).`}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={changing !== null} onOpenChange={(open) => (open ? null : setChanging(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {changing?.row.status === 'pending' ? 'Reject' : `Change to ${changing ? STATUS_LABEL[changing.status] : ''}`} —{' '}
              {changing?.row.label} {changing?.row.reference}
            </DialogTitle>
            <DialogDescription>
              {changing?.row.status !== 'pending' ? `Currently ${changing ? STATUS_LABEL[changing.row.status].toLowerCase() : ''}. ` : ''}
              {changing?.status === 'rejected'
                ? changing.row.collection === 'expenses'
                  ? 'The expense is kept for the record and its ledger posting is reversed.'
                  : 'The entry is kept and flagged as rejected so it stops counting in totals; any payment or return credit is given back to its invoice/purchase.'
                : changing?.row.status === 'rejected'
                  ? 'It will count in totals again — any payment or return credit is applied to its invoice/purchase again (expense ledger re-posted).'
                  : changing?.status === 'pending'
                    ? 'It goes back into the waiting list for a fresh review.'
                    : 'It will be marked authorized.'}
            </DialogDescription>
          </DialogHeader>
          {changing && changing.row.collection !== 'expenses' ? (
            <Textarea
              value={changeNote}
              onChange={(event) => setChangeNote(event.target.value)}
              placeholder={changing.status === 'rejected' ? 'Reason for rejection (required)' : 'Reason for the change (optional)'}
              rows={3}
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setChanging(null)}>
              Cancel
            </Button>
            <Button
              variant={changing?.status === 'rejected' ? 'destructive' : 'default'}
              disabled={changing !== null && busyKey === changing.row.key}
              onClick={() => void confirmChange()}
            >
              {changing?.status === 'rejected' ? 'Reject' : changing?.status === 'approved' ? 'Approve' : 'Send back to pending'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
