"use client"

import { useEffect, useMemo, useState } from 'react'
import { onValue, push, ref, update, type Database } from 'firebase/database'

// Monthly subscription lock. The ERP locks itself on the lock day (default
// LOCK_DAY) of any month that the Hakaluki team hasn't marked as paid (via
// /unlock). Paid months live at `erp/billing/months/{YYYY-MM}`; the lock day and
// a manual lock/unlock override live at `erp/billing/settings`; every change is
// appended to `erp/billing/logs`. Only the Hakaluki team account may write `erp/billing`
// (see database.rules.json), so ERP users can read the status but can't
// unlock themselves.

export const BILLING_PATH = 'erp/billing'
export const MONTHLY_RENT = 1000
export const LOCK_DAY = 5
// Capped at 28 so the lock day exists in every month.
export const MAX_LOCK_DAY = 28
export const WARNING_DAYS = 2
// First month that is billed — nothing before it can ever lock the ERP.
export const BILLING_START_MONTH = '2026-11'
export const BILLING_TIMEZONE = 'Asia/Dhaka'

export type PaidMonth = {
  month: string
  txnId: string
  payerNumber: string
  amount: number
  unlockedAt: number
  unlockedBy: string
  note?: string
}

// 'auto' follows paid months; 'lock' / 'unlock' force the ERP locked or
// unlocked regardless of payments until set back to 'auto'.
export type LockMode = 'auto' | 'lock' | 'unlock'

export type BillingSettings = {
  lockDay: number
  mode: LockMode
}

export const DEFAULT_BILLING_SETTINGS: BillingSettings = { lockDay: LOCK_DAY, mode: 'auto' }

export type BillingLog = {
  id: string
  action: 'unlock' | 'revoke' | 'mode' | 'lock-day'
  months: string[]
  mode?: LockMode
  lockDay?: number
  txnId?: string
  payerNumber?: string
  amount?: number
  note?: string
  at: number
  by: string
}

export type ZonedDate = { year: number; month: number; day: number; monthKey: string }

export function toMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function parseMonthKey(key: string) {
  const [year, month] = key.split('-').map(Number)
  return { year, month }
}

export function addMonths(key: string, delta: number) {
  const { year, month } = parseMonthKey(key)
  const index = year * 12 + (month - 1) + delta
  return toMonthKey(Math.floor(index / 12), (index % 12) + 1)
}

export function formatMonth(key: string) {
  const { year, month } = parseMonthKey(key)
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Calendar date of `ms` in the company's timezone (not the PC's), so a month
// boundary isn't off by the UTC offset.
export function zonedDate(ms: number, timeZone = BILLING_TIMEZONE): ZonedDate {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms))
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: BILLING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms))
  }
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const year = get('year')
  const month = get('month')
  return { year, month, day: get('day'), monthKey: toMonthKey(year, month) }
}

// Months that must be paid by `today`: every month from BILLING_START_MONTH up
// to last month, plus the current month once the lock day has arrived.
export function dueMonths(today: ZonedDate, lockDay = LOCK_DAY) {
  const last = today.day >= lockDay ? today.monthKey : addMonths(today.monthKey, -1)
  const months: string[] = []
  for (let key = BILLING_START_MONTH; key <= last; key = addMonths(key, 1)) {
    months.push(key)
  }
  return months
}

// Server time, so changing the PC clock can't dodge the lock. Re-evaluated
// every minute so an open tab locks/unlocks at the day boundary.
export function useServerNow(database: Database | null) {
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    if (!database) return
    return onValue(ref(database, '.info/serverTimeOffset'), (snapshot) => {
      setOffset(Number(snapshot.val()) || 0)
    })
  }, [database])

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  return tick + offset
}

export function usePaidMonths(database: Database | null) {
  const [months, setMonths] = useState<Record<string, PaidMonth> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!database) return
    return onValue(
      ref(database, `${BILLING_PATH}/months`),
      (snapshot) => {
        setMonths((snapshot.val() as Record<string, PaidMonth> | null) ?? {})
        setError(null)
      },
      (reason) => setError(reason.message)
    )
  }, [database])

  return { months, error }
}

function normalizeSettings(value: Partial<BillingSettings> | null): BillingSettings {
  const lockDay = Math.round(Number(value?.lockDay))
  const mode = value?.mode === 'lock' || value?.mode === 'unlock' ? value.mode : 'auto'
  return {
    lockDay: lockDay >= 1 && lockDay <= MAX_LOCK_DAY ? lockDay : LOCK_DAY,
    mode,
  }
}

export function useBillingSettings(database: Database | null) {
  const [settings, setSettings] = useState<BillingSettings | null>(null)

  useEffect(() => {
    if (!database) return
    return onValue(
      ref(database, `${BILLING_PATH}/settings`),
      (snapshot) => setSettings(normalizeSettings(snapshot.val() as Partial<BillingSettings> | null)),
      () => setSettings(DEFAULT_BILLING_SETTINGS)
    )
  }, [database])

  return settings
}

export function useBillingLogs(database: Database | null) {
  const [logs, setLogs] = useState<BillingLog[]>([])

  useEffect(() => {
    if (!database) return
    return onValue(ref(database, `${BILLING_PATH}/logs`), (snapshot) => {
      const value = (snapshot.val() as Record<string, Omit<BillingLog, 'id'>> | null) ?? {}
      setLogs(
        Object.entries(value)
          .map(([id, log]) => ({ ...log, id, months: log.months ?? [] }))
          .sort((a, b) => b.at - a.at)
      )
    }, () => setLogs([]))
  }, [database])

  return logs
}

export type BillingStatus = {
  ready: boolean
  locked: boolean
  unpaidMonths: string[]
  settings: BillingSettings
  // Set while the current month is unpaid and the lock is WARNING_DAYS or
  // fewer days away.
  warning: { monthKey: string; daysLeft: number } | null
}

// Fails open: no database, a read error (e.g. rules not deployed yet) or data
// still loading never locks the ERP.
export function useBillingStatus(database: Database | null, timeZone?: string): BillingStatus {
  const { months } = usePaidMonths(database)
  const loadedSettings = useBillingSettings(database)
  const now = useServerNow(database)

  return useMemo(() => {
    const settings = loadedSettings ?? DEFAULT_BILLING_SETTINGS
    if (!database || !months || !loadedSettings) {
      return { ready: false, locked: false, unpaidMonths: [], settings, warning: null }
    }

    const today = zonedDate(now, timeZone)
    const unpaidMonths = dueMonths(today, settings.lockDay).filter((key) => !months[key])
    const locked = settings.mode === 'lock' || (settings.mode === 'auto' && unpaidMonths.length > 0)
    const daysLeft = settings.lockDay - today.day
    const warning =
      settings.mode === 'auto'
      && unpaidMonths.length === 0
      && today.monthKey >= BILLING_START_MONTH
      && !months[today.monthKey]
      && daysLeft > 0
      && daysLeft <= WARNING_DAYS
        ? { monthKey: today.monthKey, daysLeft }
        : null

    return { ready: true, locked, unpaidMonths, settings, warning }
  }, [database, months, loadedSettings, now, timeZone])
}

export async function unlockMonths(
  database: Database,
  input: { months: string[]; txnId: string; payerNumber: string; note?: string; by: string }
) {
  const at = Date.now()
  const updates: Record<string, unknown> = {}
  for (const month of input.months) {
    updates[`months/${month}`] = {
      month,
      txnId: input.txnId,
      payerNumber: input.payerNumber,
      amount: MONTHLY_RENT,
      unlockedAt: at,
      unlockedBy: input.by,
      ...(input.note ? { note: input.note } : {}),
    } satisfies PaidMonth
  }
  const logId = push(ref(database, `${BILLING_PATH}/logs`)).key
  updates[`logs/${logId}`] = {
    action: 'unlock',
    months: input.months,
    txnId: input.txnId,
    payerNumber: input.payerNumber,
    amount: MONTHLY_RENT * input.months.length,
    ...(input.note ? { note: input.note } : {}),
    at,
    by: input.by,
  }
  await update(ref(database, BILLING_PATH), updates)
}

export async function revokeMonth(database: Database, input: { month: string; note?: string; by: string }) {
  const logId = push(ref(database, `${BILLING_PATH}/logs`)).key
  await update(ref(database, BILLING_PATH), {
    [`months/${input.month}`]: null,
    [`logs/${logId}`]: {
      action: 'revoke',
      months: [input.month],
      ...(input.note ? { note: input.note } : {}),
      at: Date.now(),
      by: input.by,
    },
  })
}

export async function setLockMode(database: Database, input: { mode: LockMode; note?: string; by: string }) {
  const logId = push(ref(database, `${BILLING_PATH}/logs`)).key
  await update(ref(database, BILLING_PATH), {
    'settings/mode': input.mode,
    [`logs/${logId}`]: {
      action: 'mode',
      months: [],
      mode: input.mode,
      ...(input.note ? { note: input.note } : {}),
      at: Date.now(),
      by: input.by,
    },
  })
}

export async function setLockDay(database: Database, input: { lockDay: number; by: string }) {
  const logId = push(ref(database, `${BILLING_PATH}/logs`)).key
  await update(ref(database, BILLING_PATH), {
    'settings/lockDay': input.lockDay,
    [`logs/${logId}`]: {
      action: 'lock-day',
      months: [],
      lockDay: input.lockDay,
      at: Date.now(),
      by: input.by,
    },
  })
}
