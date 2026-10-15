"use client"

import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isStrongPassword, useERP } from '@/lib/erp/provider'

// Every signed-in user can change their own login password, whatever their
// role — it only touches Firebase Auth, never the ERP database. Rendered on
// the Settings page and in the header's key-icon dialog (AdminShell).
export function ChangePasswordForm({ stacked = false }: { stacked?: boolean }) {
  const { changePassword } = useERP()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const mismatch = Boolean(form.confirmPassword) && form.newPassword !== form.confirmPassword

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)

    if (form.newPassword !== form.confirmPassword) {
      setMessage({ tone: 'error', text: 'New password and confirmation do not match.' })
      return
    }

    setIsSaving(true)
    try {
      await changePassword(form.currentPassword, form.newPassword)
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setMessage({ tone: 'success', text: 'Password changed. Use the new password next time you log in.' })
    } catch (reason) {
      setMessage({ tone: 'error', text: reason instanceof Error ? reason.message : 'Unable to change password.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className={`grid gap-4 ${stacked ? '' : 'sm:grid-cols-3'}`} onSubmit={handleSubmit}>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          Current password<span className="ml-0.5 text-rose-500">*</span>
        </p>
        <Input
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))}
          required
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          New password<span className="ml-0.5 text-rose-500">*</span>
        </p>
        <Input
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))}
          required
        />
        <p className={`text-xs ${form.newPassword && !isStrongPassword(form.newPassword) ? 'text-rose-500' : 'text-muted-foreground'}`}>
          At least 8 characters, with letters and numbers.
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          Confirm new password<span className="ml-0.5 text-rose-500">*</span>
        </p>
        <Input
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
          required
        />
        {mismatch ? <p className="text-xs text-rose-500">Passwords do not match.</p> : null}
      </div>
      <div className={`flex flex-wrap items-center justify-end gap-3 ${stacked ? '' : 'sm:col-span-3'}`}>
        {message ? (
          <p className={`flex-1 text-sm ${message.tone === 'success' ? 'text-emerald-600' : 'text-rose-500'}`}>{message.text}</p>
        ) : null}
        <Button
          type="submit"
          className="rounded-xl"
          disabled={isSaving || !form.currentPassword || !isStrongPassword(form.newPassword) || mismatch}
        >
          {isSaving ? 'Changing...' : 'Change password'}
        </Button>
      </div>
    </form>
  )
}
