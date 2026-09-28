import { Badge } from '@/components/ui/badge'
import type { RecordApprovalFields, RecordApprovalStatus } from '@/lib/erp/types'
import { cn } from '@/lib/utils'

const LABELS: Record<RecordApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

// Same colour scheme as the Expense list's approval badge (finance/page.tsx).
export function ApprovalStatusBadge({
  status,
  className,
  title,
}: {
  status: RecordApprovalStatus
  className?: string
  title?: string
}) {
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn(
        'rounded-full',
        status === 'approved'
          ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
          : status === 'rejected'
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300',
        className
      )}
    >
      {LABELS[status]}
    </Badge>
  )
}

// Inline status tag for a department list row (Invoice, Purchase, Cash
// entry, ...). Renders nothing for records that predate Input &
// Authorization. A rejection reason shows on hover.
export function RecordApprovalTag({ record }: { record: RecordApprovalFields }) {
  if (!record.approvalStatus) {
    return null
  }

  const reviewer = record.approvedByName ? ` by ${record.approvedByName}` : ''
  const title =
    record.approvalStatus === 'pending'
      ? 'Waiting for authorization'
      : `${LABELS[record.approvalStatus]}${reviewer}${record.approvalNote ? ` — ${record.approvalNote}` : ''}`

  return <ApprovalStatusBadge status={record.approvalStatus} title={title} className="ml-2 align-middle text-[10px]" />
}
