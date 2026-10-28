"use client"

import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { ChevronLeft, ChevronRight, Eye, EyeOff, LockKeyhole, LogOut, Unlock } from 'lucide-react'
import toast from 'react-hot-toast'

import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  BILLING_START_MONTH,
  LOCK_DAY,
  MONTHLY_RENT,
  formatMonth,
  revokeMonth,
  toMonthKey,
  unlockMonths,
  useBillingLogs,
  useBillingStatus,
  usePaidMonths,
  useServerNow,
  zonedDate,
} from '@/lib/erp/billing'
import { getBillingApp } from '@/lib/firebase/config'
import { cn } from '@/lib/utils'

function formatTime(ms: number) {
  return new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' })
}

export default function UnlockPage() {
  const billing = useMemo(() => getBillingApp(), [])
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    if (!billing) {
      setAuthReady(true)
      return
    }
    return onAuthStateChanged(billing.auth, (next) => {
      setUser(next)
      setAuthReady(true)
    })
  }, [billing])

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <LockKeyhole className="h-5 w-5 text-primary" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">ERP Billing &amp; Unlock</p>
            <p className="text-xs text-muted-foreground">Hakaluki team only</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
              <Button variant="ghost" size="icon" title="Logout" onClick={() => billing && signOut(billing.auth)}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      {!billing ? (
        <p className="p-10 text-center text-sm text-muted-foreground">Firebase is not configured.</p>
      ) : !authReady ? (
        <p className="p-10 text-center text-sm text-muted-foreground">Loading...</p>
      ) : user ? (
        <BillingConsole user={user} />
      ) : (
        <TeamLogin />
      )}
    </main>
  )
}

function TeamLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const billing = getBillingApp()
    if (!billing) return
    setSubmitting(true)
    setError(null)
    try {
      await signInWithEmailAndPassword(billing.auth, email.trim(), password)
    } catch {
      setError('Invalid email or password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,hsl(var(--primary)/0.16),transparent_45%),radial-gradient(circle_at_85%_80%,hsl(var(--primary)/0.12),transparent_45%)]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-73px)] w-full max-w-6xl items-center gap-16 px-6 py-12 lg:grid-cols-2 lg:gap-24 lg:px-10">
        <section className="hidden space-y-8 lg:block">
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            Hakaluki team only
          </span>
          <h1 className="max-w-lg text-5xl font-semibold leading-[1.1] tracking-tight text-foreground">
            Monthly billing &amp; ERP unlock.
          </h1>
          <p className="max-w-md text-base leading-7 text-muted-foreground">
            The ERP locks on day {LOCK_DAY} of every unpaid month. Record the client&apos;s payment here — one or many
            months at once — to keep it unlocked.
          </p>
          <ul className="max-w-md space-y-2 text-sm text-muted-foreground">
            <li>• Monthly rent: {MONTHLY_RENT} tk</li>
            <li>• Unlock with Txn ID and payer number</li>
            <li>• Every unlock and re-lock is logged</li>
          </ul>
        </section>

        <section className="mx-auto w-full max-w-sm">
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">Team login</h2>
            <p className="text-sm text-muted-foreground">Sign in to manage monthly ERP unlocks.</p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="team@hakaluki.dev"
                autoComplete="username"
                className="h-11 rounded-xl"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  autoComplete="current-password"
                  className="h-11 rounded-xl pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

            <Button type="submit" className="h-11 w-full rounded-xl text-sm font-medium" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Login'}
            </Button>
          </form>
        </section>
      </div>
    </div>
  )
}

function BillingConsole({ user }: { user: User }) {
  const database = getBillingApp()!.database
  const by = user.email ?? user.uid
  const { months, error } = usePaidMonths(database)
  const logs = useBillingLogs(database)
  const status = useBillingStatus(database)
  const today = zonedDate(useServerNow(database))

  const [year, setYear] = useState(today.year)
  const [selected, setSelected] = useState<string[]>([])
  const [txnId, setTxnId] = useState('')
  const [payerNumber, setPayerNumber] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const paid = months ?? {}
  const paidList = Object.values(paid).sort((a, b) => b.month.localeCompare(a.month))

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key].sort()))
  }

  async function handleUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanTxn = txnId.trim()
    const cleanNumber = payerNumber.trim()
    if (selected.length === 0) return toast.error('Select at least one month.')
    if (!cleanTxn) return toast.error('Enter the Txn ID.')
    if (!/^[0-9+\-\s]{6,20}$/.test(cleanNumber)) return toast.error('Enter a valid payer number.')
    if (Object.values(paid).some((item) => item.txnId.toLowerCase() === cleanTxn.toLowerCase())) {
      return toast.error('This Txn ID is already used for a paid month.')
    }

    setSubmitting(true)
    try {
      await unlockMonths(database, { months: selected, txnId: cleanTxn, payerNumber: cleanNumber, note: note.trim(), by })
      toast.success(`Unlocked ${selected.length} month${selected.length > 1 ? 's' : ''}.`)
      setSelected([])
      setTxnId('')
      setPayerNumber('')
      setNote('')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Unlock failed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevoke(month: string) {
    const reason = window.prompt(`Re-lock ${formatMonth(month)}? Enter a reason (optional):`)
    if (reason === null) return
    try {
      await revokeMonth(database, { month, note: reason.trim(), by })
      toast.success(`${formatMonth(month)} marked unpaid.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed.')
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-8">
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Can&apos;t read billing data: {error}. Check that the database rules are deployed.
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="ERP status" value={!status.ready ? '...' : status.locked ? 'Locked' : 'Unlocked'} tone={status.locked ? 'bad' : 'good'} />
        <StatCard label="Today (Dhaka)" value={`${today.day} ${formatMonth(today.monthKey)}`} hint={`Locks on day ${LOCK_DAY} if unpaid`} />
        <StatCard
          label="Due now"
          value={status.unpaidMonths.length ? `${MONTHLY_RENT * status.unpaidMonths.length} tk` : '0 tk'}
          hint={status.unpaidMonths.length ? status.unpaidMonths.map(formatMonth).join(', ') : 'Nothing overdue'}
          tone={status.unpaidMonths.length ? 'bad' : undefined}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Select months</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setYear((y) => y - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="w-14 text-center text-sm font-medium">{year}</span>
              <Button variant="ghost" size="icon" onClick={() => setYear((y) => y + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 12 }, (_, index) => {
              const key = toMonthKey(year, index + 1)
              const isPaid = Boolean(paid[key])
              const beforeStart = key < BILLING_START_MONTH
              const isDue = status.unpaidMonths.includes(key)
              const isSelected = selected.includes(key)
              const disabled = isPaid || beforeStart
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(key)}
                  className={cn(
                    'rounded-md border px-2 py-2.5 text-left text-sm transition-colors',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isPaid
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : isDue
                          ? 'border-red-500/50 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-400'
                          : beforeStart
                            ? 'border-border text-muted-foreground/50'
                            : 'border-border hover:bg-accent',
                    disabled && 'cursor-not-allowed'
                  )}
                >
                  <span className="block font-medium">
                    {new Date(Date.UTC(year, index, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}
                  </span>
                  <span className="block text-[11px] opacity-80">
                    {isPaid ? 'Paid' : beforeStart ? 'Not billed' : isDue ? 'Due' : key === today.monthKey ? 'Current' : 'Unpaid'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <form onSubmit={handleUnlock} className="space-y-3 rounded-lg border border-border bg-card p-5">
          <h2 className="font-semibold">Unlock</h2>
          <div className="min-h-[2.5rem] rounded-md border border-dashed border-border p-2 text-sm">
            {selected.length ? (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20"
                    title="Remove"
                  >
                    {formatMonth(key)} ×
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">No months selected</span>
            )}
          </div>
          <Input placeholder="Txn ID" value={txnId} onChange={(e) => setTxnId(e.target.value)} />
          <Input placeholder="Payer number (e.g. 01XXXXXXXXX)" value={payerNumber} onChange={(e) => setPayerNumber(e.target.value)} />
          <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span>
              {selected.length} × {MONTHLY_RENT} tk
            </span>
            <span className="font-semibold">{selected.length * MONTHLY_RENT} tk</span>
          </div>
          <Button type="submit" className="w-full" disabled={submitting || selected.length === 0}>
            <Unlock className="h-4 w-4" />
            {submitting ? 'Unlocking...' : 'Unlock'}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 font-semibold">Paid months</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3">Month</th>
                <th className="py-2 pr-3">Txn ID</th>
                <th className="py-2 pr-3">Number</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Unlocked</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {paidList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No paid months yet.
                  </td>
                </tr>
              ) : (
                paidList.map((item) => (
                  <tr key={item.month} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 font-medium">{formatMonth(item.month)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{item.txnId}</td>
                    <td className="py-2 pr-3">{item.payerNumber}</td>
                    <td className="py-2 pr-3">{item.amount} tk</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {formatTime(item.unlockedAt)} · {item.unlockedBy}
                    </td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleRevoke(item.month)}>
                        Re-lock
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 font-semibold">Activity log</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Months</th>
                <th className="py-2 pr-3">Txn ID / Number</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2">By / Note</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No activity yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{formatTime(log.at)}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-xs font-medium',
                          log.action === 'unlock'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-500/10 text-red-700 dark:text-red-400'
                        )}
                      >
                        {log.action === 'unlock' ? 'Unlock' : 'Re-lock'}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{log.months.map(formatMonth).join(', ')}</td>
                    <td className="py-2 pr-3 text-xs">
                      {log.txnId ? (
                        <>
                          <span className="font-mono">{log.txnId}</span>
                          <br />
                          {log.payerNumber}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-3">{log.amount ? `${log.amount} tk` : '—'}</td>
                    <td className="py-2 text-xs">
                      {log.by}
                      {log.note ? <span className="block text-muted-foreground">{log.note}</span> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-semibold',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'bad' && 'text-red-600 dark:text-red-400'
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
