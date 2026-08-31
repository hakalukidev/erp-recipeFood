"use client"

import { useMemo, useState } from 'react'
import { CheckCheck } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useERP } from '@/lib/erp/provider'
import type { NotificationRecord } from '@/lib/erp/types'
import { formatDateTime, notificationToneClass, sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type LevelFilter = 'all' | NotificationRecord['level']
type ReadFilter = 'all' | 'unread' | 'read'

const levelLabels: Record<NotificationRecord['level'], string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
}

export function NotificationsScreen() {
  const { data, currentUser, markNotificationRead, markAllNotificationsRead } = useERP()

  const notifications = useMemo(() => {
    const all = sortByCreatedAtDesc(toArray(data?.notifications))

    return all.filter((notification) => {
      if (!currentUser || currentUser.roleId === 'super_admin') return true
      if (!notification.roles || notification.roles.length === 0) return true
      return notification.roles.includes(currentUser.roleId)
    })
  }, [data?.notifications, currentUser])

  const [query, setQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all')
  const [readFilter, setReadFilter] = useState<ReadFilter>('all')

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return notifications.filter((notification) => {
      const matchesSearch =
        !normalizedQuery || [notification.title, notification.body].join(' ').toLowerCase().includes(normalizedQuery)
      const matchesLevel = levelFilter === 'all' || notification.level === levelFilter
      const matchesRead =
        readFilter === 'all' || (readFilter === 'unread' ? !notification.read : notification.read)

      return matchesSearch && matchesLevel && matchesRead
    })
  }, [notifications, query, levelFilter, readFilter])

  const unread = notifications.filter((notification) => !notification.read)
  const critical = notifications.filter((notification) => notification.level === 'critical')

  return (
    <AdminShell active="Notifications">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{notifications.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Low stock, overdue payments, and system alerts</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Unread</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{unread.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Not yet acknowledged</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Critical</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{critical.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Needs immediate attention</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Low stock alerts fire automatically when a product hits its minimum stock. Payment overdue alerts fire
                automatically once an order&apos;s payment due date passes.
              </CardDescription>
            </div>
            {unread.length > 0 ? (
              <Button
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => void markAllNotificationsRead(unread.map((notification) => notification.id))}
              >
                <CheckCheck className="mr-2 h-4 w-4" />
                Mark all read
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or message" />
              <Select value={levelFilter} onValueChange={(value) => setLevelFilter(value as LevelFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="All levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {(Object.keys(levelLabels) as NotificationRecord['level'][]).map((level) => (
                    <SelectItem key={level} value={level}>{levelLabels[level]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={readFilter} onValueChange={(value) => setReadFilter(value as ReadFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              {filtered.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => {
                    if (!notification.read) void markNotificationRead(notification.id)
                  }}
                  className={cn(
                    'w-full rounded-2xl border p-4 text-left transition-colors',
                    notificationToneClass(notification),
                    notification.read ? 'opacity-70' : ''
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{notification.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-full bg-background/60">{levelLabels[notification.level]}</Badge>
                      {!notification.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                    </div>
                  </div>
                  <p className="mt-1.5 text-sm">{notification.body}</p>
                  <p className="mt-2 text-xs opacity-80">{formatDateTime(notification.createdAt)}</p>
                </button>
              ))}
              {filtered.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                  No notifications match the current filters.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
