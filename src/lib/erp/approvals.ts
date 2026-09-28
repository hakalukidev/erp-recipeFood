import type {
  ERPData,
  RecordApprovalFields,
  RecordApprovalStatus,
  UserRecord,
} from '@/lib/erp/types'

// ---- Input & Authorization registry ----------------------------------------
// One entry per department input collection that goes through the
// pending → approved/rejected authorization step (see RecordApprovalFields
// in types.ts). `permission` is the `<module>:approve` id that authorizes
// it; `describe` turns a raw record into the row the Approvals page shows.
// Expenses and Stock Adjustments already had their own approval flow before
// this and keeps it (updateExpenseApproval) — it is listed on the Approvals
// page separately, not through this registry.

export type ApprovalCollection =
  | 'rateCards'
  | 'collections'
  | 'productReturns'
  | 'purchases'
  | 'vendorPayments'
  | 'materialUsages'
  | 'productionBatches'
  | 'cashMaintenance'
  | 'loanTransactions'
  | 'investors'
  | 'journalEntries'

export type ApprovalDepartment = 'sales' | 'purchase' | 'production' | 'finance' | 'accounting'

export const APPROVAL_DEPARTMENT_LABELS: Record<ApprovalDepartment, string> = {
  sales: 'Sales',
  purchase: 'Purchase',
  production: 'Production',
  finance: 'Finance',
  accounting: 'Accounting',
}

export type ApprovalRow = {
  reference: string
  party: string
  amount: number
  date: string
  detail: string
}

type ApprovableRecord = RecordApprovalFields & {
  id: string
  createdAt?: string
  createdBy?: string
  createdByName?: string
}

type ApprovalSource = {
  department: ApprovalDepartment
  label: string
  permission: string
  href: string
  describe: (record: never, data: ERPData) => ApprovalRow
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0)
}

export const APPROVAL_SOURCES: Record<ApprovalCollection, ApprovalSource> = {
  rateCards: {
    department: 'sales',
    label: 'Invoice',
    permission: 'orders:approve',
    href: '/admin/rate-card',
    describe: (record: ERPData['rateCards'][string]) => ({
      reference: record.invoiceNo,
      party: record.recipientName,
      amount: record.dealerRateTotal,
      date: record.date,
      detail: `${record.items.length} product line(s)`,
    }),
  },
  collections: {
    department: 'sales',
    label: 'Dealer Collection',
    permission: 'orders:approve',
    href: '/admin/rate-card',
    describe: (record: ERPData['collections'][string]) => ({
      reference: record.receiptNumber,
      party: record.dealerName,
      amount: record.amount,
      date: record.collectionDate,
      detail: `Against invoice ${record.invoiceNo} (${record.method})`,
    }),
  },
  productReturns: {
    department: 'sales',
    label: 'Product Return',
    permission: 'orders:approve',
    href: '/admin/product-returns',
    describe: (record: ERPData['productReturns'][string]) => ({
      reference: record.returnNumber,
      party: record.recipientName,
      amount: record.depotRateTotal,
      date: record.date,
      detail: record.reason || `${record.items.length} product line(s)`,
    }),
  },
  purchases: {
    department: 'purchase',
    label: 'Purchase Entry',
    permission: 'purchase:approve',
    href: '/admin/purchase',
    describe: (record: ERPData['purchases'][string]) => ({
      reference: record.purchaseNumber,
      party: record.vendorName,
      amount: record.totalAmount,
      date: record.date,
      detail: record.items.map((item) => item.materialName).join(', '),
    }),
  },
  vendorPayments: {
    department: 'purchase',
    label: 'Vendor Payment',
    permission: 'purchase:approve',
    href: '/admin/purchase',
    describe: (record: ERPData['vendorPayments'][string]) => ({
      reference: record.receiptNumber,
      party: record.vendorName,
      amount: record.amount,
      date: record.date,
      detail: record.purchaseNumber ? `Against purchase ${record.purchaseNumber}` : 'Against vendor total due',
    }),
  },
  materialUsages: {
    department: 'production',
    label: 'Material Usage',
    permission: 'purchase:approve',
    href: '/admin/purchase',
    describe: (record: ERPData['materialUsages'][string]) => ({
      reference: record.materialName,
      party: '—',
      amount: 0,
      date: record.date,
      detail: `${record.qty} ${record.unit} issued${record.note ? ` — ${record.note}` : ''}`,
    }),
  },
  productionBatches: {
    department: 'production',
    label: 'Production Entry',
    permission: 'purchase:approve',
    href: '/admin/purchase',
    describe: (record: ERPData['productionBatches'][string]) => ({
      reference: record.batchNumber,
      party: record.rawMaterialName,
      amount: 0,
      date: record.date,
      detail: `${record.rawKgConsumedTotal} kg → ${record.outputs
        .map((output) => `${output.qtyProduced} × ${output.finishedGoodsName}`)
        .join(', ')}`,
    }),
  },
  cashMaintenance: {
    department: 'finance',
    label: 'Cash Entry',
    permission: 'finance:approve',
    href: '/admin/cash-maintenance',
    describe: (record: ERPData['cashMaintenance'][string]) => ({
      reference: record.category,
      party: record.direction === 'in' ? 'Cash In' : 'Cash Out',
      amount: record.amount,
      date: record.date,
      detail: record.note ?? '',
    }),
  },
  loanTransactions: {
    department: 'finance',
    label: 'Loan Transaction',
    permission: 'finance:approve',
    href: '/admin/loans',
    describe: (record: ERPData['loanTransactions'][string]) => ({
      reference: record.isAdjustment
        ? 'Loan balance correction'
        : record.isOpeningBalance
          ? 'Existing loan'
          : record.type === 'withdrawal'
            ? 'Loan withdrawal'
            : 'Loan repayment',
      party: record.memberName,
      amount: record.amount,
      date: record.date,
      detail: record.note ?? '',
    }),
  },
  investors: {
    department: 'finance',
    label: 'Investor',
    permission: 'finance:approve',
    href: '/admin/loans',
    describe: (record: ERPData['investors'][string]) => ({
      reference: record.name,
      party: record.mobile,
      amount: record.amount,
      date: record.updatedAt.slice(0, 10),
      detail: record.note,
    }),
  },
  journalEntries: {
    department: 'accounting',
    label: 'Journal Voucher',
    permission: 'accounting:approve',
    href: '/admin/accounting',
    describe: (record: ERPData['journalEntries'][string]) => ({
      reference: record.journalNumber,
      party: '—',
      amount: sum(record.lines.map((line) => line.debit)),
      date: record.date.slice(0, 10),
      detail: record.narration,
    }),
  },
}

export const APPROVAL_COLLECTIONS = Object.keys(APPROVAL_SOURCES) as ApprovalCollection[]

// Every `<module>:approve` id that can authorize something — used to decide
// whether the Approvals page shows up in the sidebar at all.
export const APPROVAL_PERMISSION_IDS = Array.from(
  new Set([...Object.values(APPROVAL_SOURCES).map((source) => source.permission), 'finance:approve'])
)

// Missing status = saved before Input & Authorization existed, or
// auto-posted by another flow (e.g. a Loan repayment's own Cash entry) —
// counts as already approved.
export function getApprovalStatus(record: RecordApprovalFields | null | undefined): RecordApprovalStatus {
  return record?.approvalStatus ?? 'approved'
}

// Fields written on every create/edit of an approvable record — an edit
// re-submits it, so any earlier approve/reject is cleared.
export function pendingApprovalFields(user: Pick<UserRecord, 'id' | 'name'> | null, now: string): Required<RecordApprovalFields> {
  return {
    approvalStatus: 'pending',
    submittedBy: user?.id ?? '',
    submittedByName: user?.name ?? '',
    submittedAt: now,
    approvedBy: '',
    approvedByName: '',
    approvedAt: '',
    approvalNote: '',
  }
}

export type ApprovalQueueItem = ApprovalRow & {
  key: string
  collection: ApprovalCollection
  recordId: string
  department: ApprovalDepartment
  label: string
  permission: string
  href: string
  status: RecordApprovalStatus
  submittedBy: string
  submittedByName: string
  submittedAt: string
  approvedByName: string
  approvedAt: string
  approvalNote: string
}

// Every approvable record that has actually been through the input →
// authorization flow (i.e. has an explicit approvalStatus), newest first.
export function buildApprovalQueue(data: ERPData | null): ApprovalQueueItem[] {
  if (!data) {
    return []
  }

  const items: ApprovalQueueItem[] = []

  for (const collection of APPROVAL_COLLECTIONS) {
    const source = APPROVAL_SOURCES[collection]
    const records = Object.values((data[collection] ?? {}) as Record<string, ApprovableRecord>)

    for (const record of records) {
      if (!record?.approvalStatus) {
        continue
      }

      items.push({
        ...source.describe(record as never, data),
        key: `${collection}:${record.id}`,
        collection,
        recordId: record.id,
        department: source.department,
        label: source.label,
        permission: source.permission,
        href: source.href,
        status: record.approvalStatus,
        submittedBy: record.submittedBy || record.createdBy || '',
        submittedByName: record.submittedByName || record.createdByName || '',
        submittedAt: record.submittedAt || record.createdAt || '',
        approvedByName: record.approvedByName ?? '',
        approvedAt: record.approvedAt ?? '',
        approvalNote: record.approvalNote ?? '',
      })
    }
  }

  return items.sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
}
