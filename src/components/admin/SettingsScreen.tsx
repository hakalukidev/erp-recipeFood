"use client"

import { useEffect, useState, type FormEvent } from 'react'

import { AdminShell } from './AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useERP } from '@/lib/erp/provider'
import type { RefundPolicy } from '@/lib/erp/types'

type SettingsFormState = {
  companyName: string
  currency: string
  timezone: string
  returnWindowDays: string
  refundPolicy: RefundPolicy
  restockOnReturn: boolean
}

const currencyOptions = ['BDT', 'USD', 'CNY', 'EUR']

const refundPolicyLabels: Record<RefundPolicy, string> = {
  cash: 'Cash refund',
  'store-credit': 'Store credit',
  exchange: 'Exchange only',
}

const refundPolicyHints: Record<RefundPolicy, string> = {
  cash: 'Refund the amount paid back to the customer directly.',
  'store-credit': 'Issue a store credit the customer can use on a future order.',
  exchange: 'Only allow swapping for another product, no cash or credit.',
}

function formFromSettings(settings: SettingsFormState | null): SettingsFormState {
  if (!settings) {
    return {
      companyName: '',
      currency: 'BDT',
      timezone: 'Asia/Dhaka',
      returnWindowDays: '7',
      refundPolicy: 'store-credit',
      restockOnReturn: true,
    }
  }

  return settings
}

export function SettingsScreen() {
  const { data, saveSettings, hasPermission } = useERP()
  const canEdit = hasPermission('users:edit')

  const [form, setForm] = useState<SettingsFormState>(() => formFromSettings(null))
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!data?.settings) {
      return
    }

    setForm({
      companyName: data.settings.companyName,
      currency: data.settings.currency,
      timezone: data.settings.timezone,
      returnWindowDays: String(data.settings.returnWindowDays),
      refundPolicy: data.settings.refundPolicy,
      restockOnReturn: data.settings.restockOnReturn,
    })
  }, [data?.settings])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setIsSaving(true)

    try {
      await saveSettings({
        companyName: form.companyName,
        currency: form.currency,
        timezone: form.timezone,
        returnWindowDays: Number(form.returnWindowDays || 0),
        refundPolicy: form.refundPolicy,
        restockOnReturn: form.restockOnReturn,
      })
      setFeedback('Settings saved.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save settings.')
    } finally {
      setIsSaving(false)
    }
  }

  // Section 66 (Security — Backup): an on-demand, client-side export of the
  // full ERP snapshot already held in memory. Automated/scheduled backups
  // are configured at the Firebase project level, outside application code.
  function handleDownloadBackup() {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(data.settings.companyName || 'erp').replace(/\s+/g, '-').toLowerCase()}-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AdminShell active="Settings">
      <div className="space-y-6">
        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        {!canEdit ? (
          <Card className="border-border/70 bg-muted/30 shadow-sm">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Your current role can view these settings but cannot change them.
            </CardContent>
          </Card>
        ) : null}

        <form className="space-y-6" onSubmit={handleSubmit}>
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Business profile</CardTitle>
              <CardDescription>Company identity, base currency, and timezone used across invoices and reports.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Company name<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Input
                  value={form.companyName}
                  onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                  placeholder="RecipeFood"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Timezone</p>
                <Input
                  value={form.timezone}
                  onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                  placeholder="Asia/Dhaka"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Base currency</p>
                <Select value={form.currency} onValueChange={(value) => setForm((current) => ({ ...current, currency: value }))} disabled={!canEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Used to format every price, invoice, and report across the ERP.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Return &amp; refund policy</CardTitle>
              <CardDescription>These defaults apply across Sales &amp; Billing until overridden on an individual order.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Return window (days)</p>
                <Input
                  type="number"
                  min="0"
                  value={form.returnWindowDays}
                  onChange={(event) => setForm((current) => ({ ...current, returnWindowDays: event.target.value }))}
                  placeholder="7"
                  disabled={!canEdit}
                />
                <p className="text-xs text-muted-foreground">Number of days after delivery a customer may request a return.</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Refund method</p>
                <Select
                  value={form.refundPolicy}
                  onValueChange={(value) => setForm((current) => ({ ...current, refundPolicy: value as RefundPolicy }))}
                  disabled={!canEdit}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(refundPolicyLabels) as RefundPolicy[]).map((policy) => (
                      <SelectItem key={policy} value={policy}>{refundPolicyLabels[policy]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{refundPolicyHints[form.refundPolicy]}</p>
              </div>
              <div className="sm:col-span-2 flex items-center justify-between gap-4 rounded-xl border border-border/70 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Restock returned items automatically</p>
                  <p className="text-xs text-muted-foreground">
                    On, returned stock goes back into stock. Off, returns are held aside for manual inspection before restocking.
                  </p>
                </div>
                <Switch
                  checked={form.restockOnReturn}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, restockOnReturn: checked }))}
                  disabled={!canEdit}
                />
              </div>
            </CardContent>
          </Card>

          {canEdit ? (
            <div className="flex justify-end">
              <Button type="submit" className="rounded-xl" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save settings'}
              </Button>
            </div>
          ) : null}
        </form>

        {/* Section 66 — Security. Role Permission, Session Management, Login
            History, and Automatic Logout are already enforced app-wide (see
            hasPermission/IDLE_TIMEOUT_MS in provider.tsx and the User & Role
            Management page). Database Encryption and HTTPS/SSL
            are provided by the hosting platform (Firebase Realtime Database
            encrypts data at rest and requires TLS in transit; Firebase/
            Vercel hosting serves the app over HTTPS only) rather than
            application code, and scheduled Backup/Disaster Recovery is
            configured at the Firebase project level — this card's export
            button is the on-demand counterpart an admin can trigger anytime.
            Two-Factor Authentication is intentionally not built yet. */}
        {canEdit ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>What&apos;s already enforced, and an on-demand backup of everything currently in the ERP.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <li>✓ Role-based permissions (View/Create/Edit/Delete/Approve/Export per role)</li>
                <li>✓ Strong password required for new logins</li>
                <li>✓ Session timeout &amp; automatic logout after inactivity</li>
                <li>✓ Login history with device and IP address</li>
                <li>✓ Full audit trail of every action</li>
                <li>✓ Data encrypted in transit (HTTPS) and at rest (Firebase)</li>
              </ul>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Backup</p>
                  <p className="text-xs text-muted-foreground">Download every record currently in the ERP as one JSON file.</p>
                </div>
                <Button type="button" variant="outline" className="rounded-xl" onClick={handleDownloadBackup}>
                  Download backup
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  )
}
