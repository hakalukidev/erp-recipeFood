"use client"

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import { formatDateTime, toArray } from '@/lib/erp/utils'

const ALL_VALUE = '__all__'

const ACTION_TONE: Record<string, string> = {
  user_login: 'chart-2',
  user_logout: 'chart-4',
}

function toneForAction(action: string) {
  if (ACTION_TONE[action]) return ACTION_TONE[action]
  if (action.includes('delete') || action.includes('cancel') || action.includes('reject')) return 'destructive'
  if (action.includes('approve') || action.includes('created')) return 'chart-2'
  if (action.includes('update') || action.includes('change') || action.includes('reverse')) return 'chart-3'
  return 'chart-1'
}

function prettifyAction(action: string) {
  return action.replaceAll('_', ' ').replace(/^\w/, (char) => char.toUpperCase())
}

// Section 65 — Audit Trail: every Login/Logout/Create/Edit/Delete/Approval/
// Cancel/Stock Adjustment/Price Change/Discount Change/Accounting
// Adjustment already funnels into the `activities` collection via
// writeActivity (provider.tsx); this is the read-only viewer for it.
// Nothing here can edit or delete an entry — the log itself is append-only.
export function AuditLogScreen() {
  const { data, hasPermission } = useERP()
  const canView = hasPermission('users:view')

  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState(ALL_VALUE)
  const [actionFilter, setActionFilter] = useState(ALL_VALUE)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const activities = useMemo(
    () => toArray(data?.activities).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data?.activities]
  )

  const modules = useMemo(() => Array.from(new Set(activities.map((entry) => entry.module))).sort(), [activities])
  const actions = useMemo(() => Array.from(new Set(activities.map((entry) => entry.action))).sort(), [activities])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return activities.filter((entry) => {
      if (moduleFilter !== ALL_VALUE && entry.module !== moduleFilter) return false
      if (actionFilter !== ALL_VALUE && entry.action !== actionFilter) return false
      const day = entry.createdAt.slice(0, 10)
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
      if (needle) {
        const haystack = `${entry.message} ${entry.userName} ${entry.reason ?? ''}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [activities, moduleFilter, actionFilter, dateFrom, dateTo, search])

  if (!canView) {
    return (
      <AdminShell active="Audit Log">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
            <CardDescription>Your role doesn&apos;t have permission to view the audit trail.</CardDescription>
          </CardHeader>
        </Card>
      </AdminShell>
    )
  }

  return (
    <AdminShell active="Audit Log">
      <div className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <Badge variant="outline" className="w-fit rounded-full">Section 65</Badge>
            <CardTitle>Audit trail</CardTitle>
            <CardDescription>
              Every login, logout, create, edit, delete, approval, cancel, stock adjustment, price/discount change, and
              accounting adjustment — who, what, and when. Nothing here can be edited or permanently deleted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search message, user, or reason" />
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All modules</SelectItem>
                  {modules.map((module) => (
                    <SelectItem key={module} value={module}>{module}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All actions</SelectItem>
                  {actions.map((action) => (
                    <SelectItem key={action} value={action}>{prettifyAction(action)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-8" />
                      <TableHead>When</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                          No matching audit entries.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((entry) => {
                        const hasDetail = Boolean(entry.oldValue || entry.newValue || entry.reason)
                        const expanded = expandedId === entry.id
                        return (
                          <Fragment key={entry.id}>
                            <TableRow
                              className={hasDetail ? 'cursor-pointer' : undefined}
                              onClick={() => hasDetail && setExpandedId(expanded ? null : entry.id)}
                            >
                              <TableCell>
                                {hasDetail ? (expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />) : null}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(entry.createdAt)}</TableCell>
                              <TableCell className="font-medium">{entry.userName}</TableCell>
                              <TableCell>
                                <Badge className="rounded-full" style={{ backgroundColor: `hsl(var(--${toneForAction(entry.action)}) / 0.15)`, color: `hsl(var(--${toneForAction(entry.action)}))` }}>
                                  {prettifyAction(entry.action)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{entry.module}</TableCell>
                              <TableCell className="text-sm">{entry.message}</TableCell>
                            </TableRow>
                            {expanded ? (
                              <TableRow>
                                <TableCell />
                                <TableCell colSpan={5} className="bg-muted/30 text-sm">
                                  <div className="space-y-2 py-2">
                                    {entry.reason ? (
                                      <p><span className="font-medium">Reason: </span>{entry.reason}</p>
                                    ) : null}
                                    {entry.oldValue || entry.newValue ? (
                                      <div className="grid gap-3 sm:grid-cols-2">
                                        {entry.oldValue ? (
                                          <div>
                                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Old value</p>
                                            <pre className="overflow-x-auto rounded-lg bg-background p-2 text-xs">{JSON.stringify(JSON.parse(entry.oldValue), null, 2)}</pre>
                                          </div>
                                        ) : null}
                                        {entry.newValue ? (
                                          <div>
                                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">New value</p>
                                            <pre className="overflow-x-auto rounded-lg bg-background p-2 text-xs">{JSON.stringify(JSON.parse(entry.newValue), null, 2)}</pre>
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
