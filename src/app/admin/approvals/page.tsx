"use client"

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Search, ShieldCheck, XCircle } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { ApprovalStatusBadge } from '@/components/admin/ApprovalStatusBadge'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { expenseCategoryLabel, formatCurrency, formatDate, formatDateTime } from '@/lib/erp/utils'
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
  const [rejecting, setRejecting] = useState<QueueRow | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const currency = data?.settings.currency

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
    () => allRows.filter((row) => hasPermission(row.permission) || row.submittedBy === currentUser?.id),
    [allRows, currentUser?.id, hasPermission]
  )

  const counts = useMemo(() => {
    const result: Record<RecordApprovalStatus, number> = { pending: 0, approved: 0, rejected: 0 }
    visibleRows.forEach((row) => {
      result[row.status] += 1
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

  function canReview(row: QueueRow) {
    if (row.status !== 'pending' || !hasPermission(row.permission)) return false
    // Maker-checker: nobody but Super Admin authorizes their own entry
    // (enforced again in reviewRecordApproval).
    return row.submittedBy !== currentUser?.id || currentUser?.roleId === 'super_admin'
  }

  async function review(row: QueueRow, status: 'approved' | 'rejected', note?: string) {
    setBusyKey(row.key)
    setFeedback(null)
    try {
      if (row.collection === 'expenses') {
        await updateExpenseApproval(row.recordId, status)
      } else {
        await reviewRecordApproval(row.collection, row.recordId, status, note)
      }
      setFeedback(`${row.label} ${row.reference} ${status}.`)
      return true
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to update this entry.')
      return false
    } finally {
      setBusyKey(null)
    }
  }

  async function confirmReject() {
    if (!rejecting) return
    if (rejecting.collection !== 'expenses' && !rejectNote.trim()) {
      setFeedback('Give a reason for rejecting this entry.')
      return
    }
    const done = await review(rejecting, 'rejected', rejectNote)
    if (done) {
      setRejecting(null)
      setRejectNote('')
    }
  }

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
        <div className="grid gap-4 sm:grid-cols-3">
          {(['pending', 'approved', 'rejected'] as const).map((status) => (
            <Card key={status} className="border-border/70 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">
                  {status === 'pending' ? 'Waiting for authorization' : status === 'approved' ? 'Approved' : 'Rejected'}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{counts[status].toLocaleString('en-BD')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isApprover ? 'Entries you can see across departments' : 'Entries you submitted'}
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
                  Approved entries are locked — only an approver can change them, which sends them back for review.
                </CardDescription>
              </div>
              <ExportMenu filenameBase="approvals" title="Input & Authorization" headers={exportHeaders} rows={exportRows} />
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
                          {canReview(row) ? (
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
                                onClick={() => {
                                  setRejectNote('')
                                  setRejecting(row)
                                }}
                                aria-label={`Reject ${row.label} ${row.reference}`}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
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
                        {statusFilter === 'pending' ? 'Nothing is waiting for authorization.' : 'No entries found.'}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={rejecting !== null} onOpenChange={(open) => (open ? null : setRejecting(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reject {rejecting?.label} {rejecting?.reference}
            </DialogTitle>
            <DialogDescription>
              {rejecting?.collection === 'expenses'
                ? 'The expense is kept for the record and its ledger posting is reversed.'
                : 'The entry is kept and flagged as rejected so the department can correct it (editing re-submits it) or delete it.'}
            </DialogDescription>
          </DialogHeader>
          {rejecting?.collection !== 'expenses' ? (
            <Textarea
              value={rejectNote}
              onChange={(event) => setRejectNote(event.target.value)}
              placeholder="Reason for rejection (required)"
              rows={3}
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejecting !== null && busyKey === rejecting.key}
              onClick={() => void confirmReject()}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
