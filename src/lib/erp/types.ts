export type PermissionDefinition = {
  id: string
  label: string
  description: string
}

export type RoleRecord = {
  id: string
  name: string
  description: string
  permissions: Record<string, true>
}

// ---- Section 63 (User Role & Permission) --------------------------------
// A role is created/edited from the Role & Permission Matrix (User & Role
// Management page) — `permissions` is the flat list of `module:action`
// permission ids (see ALL_PERMISSION_IDS/toPermissionSet in defaultData.ts)
// that get checked into the role's `{ [id]: true }` map by saveRole.
export type RoleInput = {
  name: string
  description?: string
  permissions: string[]
}

export type UserRecord = {
  id: string
  name: string
  loginId: string
  email: string
  phone: string
  roleId: string
  title: string
  status: 'active' | 'inactive'
}

export type LoginHistoryRecord = {
  id: string
  userId: string
  userName: string
  roleId: string
  roleName: string
  userAgent: string
  // Section 66 (Security — IP/Device Log): best-effort public IP looked up
  // client-side at login time (see login() in provider.tsx). Left blank if
  // the lookup fails or is blocked — never blocks sign-in either way.
  ipAddress?: string
  createdAt: string
}

// ---- Dealer (replaces the former Customers/CRM module) -------------------
// A dealer is just who an order/sale is billed to — nothing more. There is
// no credit limit, due-balance, territory, or customer-type distinction
// anymore; outstanding balances are always derived live from OrderRecord.due
// (see computeDealerDue in utils.ts) instead of being stored here.
export type DealerRecord = {
  id: string
  name: string
  address: string
  phone: string
  createdAt: string
  updatedAt: string
}

export type ProductStatus = 'active' | 'low-stock' | 'out-of-stock'

export type ProductRecord = {
  id: string
  name: string
  banglaName?: string
  englishName?: string
  category: string
  subCategory?: string
  brand: string
  // Also serves as the Section 15 "Stock Type" classification (Raw
  // Material, Packaging Material, Semi-Finished Goods, Finished Goods,
  // Damaged Goods, Returned Goods, Promotional Stock) — see productType
  // options in StockOverviewScreen.tsx.
  productType?: string
  sku: string
  serialNumber?: string
  warrantyMonths?: number
  unit?: string
  purchaseUnit?: string
  salesUnit?: string
  conversionRatio?: number
  packSize?: string
  weight?: number
  purchasePrice: number
  sellingPrice: number
  wholesalePrice: number
  mrp?: number
  dealerPrice?: number
  distributorPrice?: number
  minSellingPrice?: number
  batchApplicable?: boolean
  expiryApplicable?: boolean
  isActive?: boolean
  stockQty: number
  minStock: number
  maxStock: number
  status: ProductStatus
  description: string
  imageUrl?: string
  imagePublicId?: string
  createdAt: string
  updatedAt: string
}

export type OrderStatus = 'pending' | 'ready' | 'shipped' | 'completed' | 'hold' | 'cancelled'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

// Section 18 completion — which specific batch(es) this line's quantity was
// drawn from, soonest-expiry-first (see consumeBatchesFefo in provider.tsx).
// Empty/absent when the product isn't batch-tracked, or when tracked batches
// didn't hold enough to cover the full quantity (the shortfall is silently
// drawn from the untracked portion of stockQty, same as before this chunk).
export type OrderItemBatchAllocation = {
  batchId: string
  batchNumber: string
  quantity: number
}

export type OrderItem = {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  purchasePrice: number
  batchAllocations?: OrderItemBatchAllocation[]
}

export type PriceMode = 'retail' | 'wholesale'

export type OrderRecord = {
  id: string
  billNumber: string
  dealerId: string
  dealerName: string
  salesPersonId: string
  salesPersonName: string
  status: OrderStatus
  approvalStatus?: ApprovalStatus
  paymentStatus: PaymentStatus
  priceMode: PriceMode
  total: number
  subtotal?: number
  discount?: number
  promotionalDiscount?: number
  vat?: number
  paid: number
  due: number
  deliveryDate: string
  paymentDueDate: string
  dueReference: 'owner' | 'courier' | 'bank' | 'bkash' | 'nagad' | 'dbbl' | ''
  overdueNotified?: boolean
  remarks?: string
  createdAt: string
  items: OrderItem[]
  // Section 49 — Sales Approval Workflow: approval is only required for the
  // special cases the spec lists (Special Discount / Below Minimum Price); a
  // plain order skips straight to "approved". This records which
  // condition(s) actually fired, so an
  // approver (Sales Manager / Finance-Credit Control / Management — gated
  // on the existing orders:approve permission, same simplification already
  // used for this single-stage gate) can see why the order needs sign-off.
  approvalReasons?: string[]
}

// One ledger entry per debit or credit leg of the auto-posted double entry
// (see createOrder / cancelOrder / createSalesReturn in provider.tsx).
// `orderId`/`billNumber` double as a generic reference id and document
// number — a sales order for invoice/collection entries, a sales return for
// return-adjustment entries, an expense for expense-payment entries, or a
// journal entry for a manual posting (see Section 27-29).
//
// This is the fixed set of *system* posting keys the Automatic Accounting
// Engine already knows how to write to on its own (Sales, Purchase, Sales
// Cost, Dealer Collection, Supplier Payment, Expense — Section 29). Every
// other Chart of Accounts account (Section 28) that has no automatic
// posting wired up yet — Bank, Raw Material, Finished Goods, Fixed Assets,
// Advance, Bank Loan, Other Payable, Share Capital, Retained Earnings,
// Other Income — is posted to only via a manual Journal Entry, using the
// 'manual' key with `accountRef` holding the actual ChartOfAccountRecord id
// (see resolveLedgerAccount in the accounting page for how the two schemes
// are reconciled into one General Ledger).
export type LedgerAccount =
  | 'dealer'
  | 'sales'
  | 'vat_payable'
  | 'cogs'
  | 'inventory'
  | 'cash'
  | 'bank'
  | 'accounts_payable'
  | 'sales_return'
  | 'supplier'
  | 'wip'
  | 'salary'
  | 'rent'
  | 'electricity'
  | 'transport'
  | 'marketing'
  | 'commission'
  | 'office_expense'
  | 'factory_expense'
  | 'bank_charge'
  | 'depreciation'
  | 'other_expense'
  | 'fuel'
  | 'advertisement'
  | 'repair'
  | 'utility'
  | 'travel'
  | 'mfs'
  | 'manual'

export type LedgerEntryRecord = {
  id: string
  date: string
  orderId: string
  billNumber: string
  account: LedgerAccount
  accountRef?: string
  description: string
  debit: number
  credit: number
  reversalOf?: string
  createdAt: string
}

// ---- Accounting Module: Chart of Accounts / Journal (Sections 27-29) ---
// Double-entry accounting hierarchy (Section 28): every account belongs to
// exactly one of the five top-level groups. `ledgerAccount`, when set,
// links this Chart of Accounts row to the fixed LedgerAccount key the
// Automatic Accounting Engine posts to for that account (see LedgerAccount
// above) — a "system" account. Accounts with no `ledgerAccount` (Bank,
// Fixed Assets, Share Capital, individual expense heads, etc.) only ever
// move via a manual Journal Entry.
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

export type ChartOfAccountRecord = {
  id: string
  code: string
  name: string
  type: AccountType
  ledgerAccount?: LedgerAccount
  // System accounts (isSystem) back a live automatic posting and can never
  // be deleted or reassigned to a different LedgerAccount — only
  // deactivated. Anything else is a plain manual account the user added.
  isSystem: boolean
  openingBalance: number
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt: string
}

export type ChartOfAccountInput = {
  code: string
  name: string
  type: AccountType
  openingBalance?: number
  status?: ChartOfAccountRecord['status']
}

// A manual Journal Voucher (Section 27 "Journal") — the general-purpose
// escape hatch for anything the automatic engine doesn't post on its own
// (owner's capital injection, a bank loan drawdown, monthly depreciation,
// an opening-balance correction, etc.). Every line posts one
// LedgerEntryRecord with account:'manual' and accountRef:<chartAccountId>.
// Never hard-deleted once posted — only reversed, so the GL/audit trail is
// permanent; see reverseJournalEntry in provider.tsx.
export type JournalEntryLine = {
  accountId: string
  accountName: string
  debit: number
  credit: number
  description?: string
}

export type JournalEntryStatus = 'posted' | 'reversed'

export type JournalEntryRecord = {
  id: string
  journalNumber: string
  date: string
  narration: string
  lines: JournalEntryLine[]
  status: JournalEntryStatus
  createdBy: string
  createdByName: string
  createdAt: string
}

export type JournalEntryInput = {
  date?: string
  narration: string
  lines: Array<{ accountId: string; debit: number; credit: number; description?: string }>
}

// ---- Bank Management (Section 35) ----------------------------------------
// Multiple named bank accounts. Each one auto-gets its own manual Chart of
// Accounts row (see saveBankAccount in provider.tsx) so every transaction
// against it posts through the same account:'manual'/accountRef:<coaId>
// scheme a Journal Entry line uses — the General Ledger, Trial Balance, and
// Balance Sheet already know how to resolve that, no report code needed
// to special-case "bank accounts" as a concept.
export type BankAccountRecord = {
  id: string
  bankName: string
  branch: string
  accountNumber: string
  openingBalance: number
  chartAccountId: string
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt: string
}

export type BankAccountInput = {
  bankName: string
  branch?: string
  accountNumber: string
  openingBalance?: number
  status?: BankAccountRecord['status']
}

// deposit/withdrawal always move against Cash (Dr Bank/Cr Cash or the
// reverse) to keep the common case a one-field form; transfer moves
// between two named bank accounts; cheque_issued/cheque_deposited and
// bank_charge need a counter account since what they're actually for
// varies — bank_charge defaults to the standard Bank Charge expense
// account, cheque_issued/cheque_deposited ask for one (same account
// picker a Journal Entry line uses).
export type BankTransactionType = 'deposit' | 'withdrawal' | 'transfer' | 'cheque_issued' | 'cheque_deposited' | 'bank_charge'

export type BankTransactionRecord = {
  id: string
  bankAccountId: string
  bankLabel: string
  type: BankTransactionType
  amount: number
  date: string
  toBankAccountId?: string
  toBankLabel?: string
  counterAccountId?: string
  counterAccountName?: string
  chequeNumber?: string
  payee?: string
  note?: string
  createdBy: string
  createdByName: string
  createdAt: string
}

export type BankTransactionInput = {
  bankAccountId: string
  type: BankTransactionType
  amount: number
  date?: string
  toBankAccountId?: string
  counterAccountId?: string
  chequeNumber?: string
  payee?: string
  note?: string
}

// ---- Batches / FIFO-FEFO (Section 18) -----------------------------------
// Historically created at GRN time whenever a received line carried a batch
// number or expiry date (the supplier/purchase-order module that produced
// these has since been removed). A sale still consumes the soonest-expiring
// batch(es) first (see consumeBatchesFefo/createOrder in provider.tsx) —
// quantity here decreases as an order is created/edited and is restored on
// cancel/edit-away, same reverse-then-repost pattern as the rest of the
// sale's stock/ledger effects.
export type BatchRecord = {
  id: string
  productId: string
  productName: string
  batchNumber: string
  manufacturingDate: string
  expiryDate: string
  quantity: number
  purchaseOrderId: string
  createdAt: string
  updatedAt: string
}

// ---- Stock Adjustment (Section 19) --------------------------------------
// The ONLY way stockQty should change outside a legitimate business
// document (sale, GRN, transfer, return) — reason + approval + audit log.
export type StockAdjustmentStatus = 'pending' | 'approved' | 'rejected'

export type StockAdjustmentRecord = {
  id: string
  productId: string
  productName: string
  quantityBefore: number
  quantityAfter: number
  delta: number
  reason: string
  status: StockAdjustmentStatus
  requestedBy: string
  requestedByName: string
  approvedBy: string
  approvedByName: string
  createdAt: string
  updatedAt: string
}

export type StockAdjustmentInput = {
  productId: string
  newQuantity: number
  reason: string
}

// ---- Stock Count (Section 20) -------------------------------------------
export type StockCountItem = {
  productId: string
  productName: string
  systemQty: number
  physicalQty: number
  variance: number
}

export type StockCountRecord = {
  id: string
  countNumber: string
  items: StockCountItem[]
  countedBy: string
  countedByName: string
  createdAt: string
}

export type StockCountInput = {
  items: Array<{ productId: string; physicalQty: number }>
}

// ---- Rate Card / Costing Sheet --------------------------------------------
// One order/shipment moving Company → Depot → Dealer, entered ONCE and
// printable as any of three vouchers from the same record (see
// buildRateCardHtml / buildDepotInvoiceHtml / buildDealerInvoiceHtml in the
// Rate Card screen) — so every field below is always filled in, not just
// the subset one particular voucher happens to print:
//   Company voucher — every rate column + the margin box (raw/manuf/depot/
//     dealer rate, Usable Money, Usable u Depot, Pouch Carton amount)
//   Depot voucher    — Depot P P (= depotRate) / Depot S P (= dealerRate)
//     and Depot Net Profit (dealerRateTotal − depotRateTotal, derived, not
//     stored)
//   Dealer voucher   — DP (= dealerRate) / TP (= tpRate) and the running
//     account (previousDue, damage, routeDiscount, targetIncentive →
//     depotReceivable)
//   mrpRate — the end-consumer price (Maximum Retail Price), one step past
//     TP; not printed on any of the three depot-chain vouchers above (none
//     of the client's paper invoices show it — they stop at TP) but kept on
//     the line item/totals so it's on record for whoever prices the shelf.
// See computeRateCardTotals in provider.tsx for the totals below:
//   pouchCartonAmount = manufRateTotal − rawRateTotal
//   usableMoney        = depotRateTotal − manufRateTotal   (margin up to Depot)
//   usableUDepot        = dealerRateTotal − manufRateTotal  (margin skipping Depot)
//   both percentages are the figure above ÷ dealerRateTotal
//   depotReceivable    = dealerRateTotal + previousDue − damage −
//                         routeDiscount − targetIncentive
// previousDue is a plain stored number entered by hand (Dealer records carry
// no running balance) so past vouchers don't change if a dealer's later
// orders move their outstanding balance.
export type RateCardLineItem = {
  productId?: string
  productName: string
  qty: number
  rawRate: number
  manufRate: number
  depotRate: number
  dealerRate: number
  // Trade Price — what the dealer resells this product at (Dealer voucher's
  // "TP" column); 0/unused on a line that never reaches a dealer.
  tpRate?: number
  // Maximum Retail Price — what the end consumer pays; one step past TP.
  mrpRate?: number
  perCtnBgs?: string
}

export type RateCardRecord = {
  id: string
  invoiceNo: string
  // The dealer this shipment is ultimately for — shown as "Dealer Name" on
  // all three vouchers.
  recipientName: string
  date: string
  deliveryDate?: string
  // Links recipientName back to a Dealer List record so name/phone can be
  // auto-filled instead of retyped.
  dealerId?: string
  // The "To: Depot" box on a Depot voucher / "From: Depot" box on a Dealer
  // voucher — free text since depots aren't (yet) their own master-data
  // entity.
  depotName?: string
  depotAddress?: string
  depotMobile?: string
  depotHelpline?: string
  // Dealer voucher running-account adjustments; see depotReceivable formula
  // above. Each defaults to 0.
  previousDue?: number
  damage?: number
  routeDiscount?: number
  targetIncentive?: number
  items: RateCardLineItem[]
  remarks?: string
  rawRateTotal: number
  manufRateTotal: number
  depotRateTotal: number
  dealerRateTotal: number
  tpRateTotal: number
  mrpRateTotal: number
  pouchCartonAmount: number
  usableMoney: number
  usableMoneyPercent: number
  usableUDepot: number
  usableUDepotPercent: number
  depotReceivable: number
  createdAt: string
  updatedAt: string
}

export type RateCardInput = {
  invoiceNo: string
  recipientName: string
  date: string
  deliveryDate?: string
  dealerId?: string
  depotName?: string
  depotAddress?: string
  depotMobile?: string
  depotHelpline?: string
  previousDue?: number
  damage?: number
  routeDiscount?: number
  targetIncentive?: number
  items: RateCardLineItem[]
  remarks?: string
}

// ---- Quality Control (Section 26) ---------------------------------------
// One QC module — the detailed lab-test parameters. Production
// (completeProduction) is the only source that creates these today; 'purchase'
// is kept only so historical records from the removed supplier/purchase-order
// module still type-check.
export type QcSourceType = 'purchase' | 'production'
export type QcTestResult = 'pass' | 'fail'

export type QualityCheckRecord = {
  id: string
  sourceType: QcSourceType
  sourceId: string
  sourceReference: string
  productId: string
  productName: string
  batchNumber: string
  moisture: string
  colour: string
  aroma: string
  weight: string
  qualityGrade: string
  testResult: QcTestResult
  qcOfficerName: string
  remarks: string
  createdAt: string
}

export type QualityCheckInput = {
  batchNumber?: string
  moisture?: string
  colour?: string
  aroma?: string
  weight?: string
  qualityGrade?: string
  qcOfficerName?: string
  remarks?: string
}

// Stock that exists physically but failed QC — excluded from sellable
// stock until explicitly released (back to stock) or scrapped (written off
// for good). This is what "Fail হলে ... Sales-এ যাবে না" (won't go to
// Sales) actually enforces.
export type QcHoldStatus = 'held' | 'released' | 'scrapped'

export type QcHoldRecord = {
  id: string
  sourceType: QcSourceType
  sourceId: string
  sourceReference: string
  productId: string
  productName: string
  quantity: number
  unitCost: number
  reason: string
  status: QcHoldStatus
  createdAt: string
  updatedAt: string
}

// ---- Sales Return (Section 11) ------------------------------------------
export type SalesReturnCondition = 'good' | 'damaged'

export type SalesReturnItem = {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  purchasePrice: number
  condition: SalesReturnCondition
}

export type SalesReturnRecord = {
  id: string
  returnNumber: string
  orderId: string
  billNumber: string
  dealerId: string
  dealerName: string
  items: SalesReturnItem[]
  totalRefund: number
  restockedQty: number
  writtenOffQty: number
  inspectionNote: string
  processedBy: string
  processedByName: string
  createdAt: string
}

export type SalesReturnInput = {
  orderId: string
  items: Array<{ productId: string; quantity: number; condition: SalesReturnCondition }>
  inspectionNote?: string
}

// ---- Collection Management (Section 31) ---------------------------------
// A Sales/Collection Officer recording money collected against a specific
// outstanding invoice — separate from the `paid` amount entered at invoice
// creation time (createOrder), which stays cash-only. This is the flow
// that gets a Cash/Bank/MFS choice and a printable Receipt.
export type CollectionMethod = 'cash' | 'bank' | 'mfs'

export type CollectionRecord = {
  id: string
  receiptNumber: string
  orderId: string
  billNumber: string
  dealerId: string
  dealerName: string
  amount: number
  method: CollectionMethod
  collectionDate: string
  collectedBy: string
  collectedByName: string
  createdAt: string
}

export type CollectionInput = {
  orderId: string
  amount: number
  method: CollectionMethod
  collectionDate?: string
}

export type NotificationRecord = {
  id: string
  title: string
  body: string
  level: 'info' | 'warning' | 'critical'
  read: boolean
  createdAt: string
  roles?: string[]
}

// Section 65 (Audit Trail): every Login/Logout/Create/Edit/Delete/Approval/
// Cancel/Stock Adjustment/Price Change/Discount Change/Accounting
// Adjustment already funnels through writeActivity (provider.tsx) into this
// one append-only collection — never edited or deleted once written. See
// AuditLogScreen.tsx for the viewer. `oldValue`/`newValue`/`reason` are only
// populated for the Section 64 Approval System flow (an edit or cancel that
// changes an already-created record) — JSON-stringified snapshots so the
// diff survives even after the record itself changes again later.
export type ActivityRecord = {
  id: string
  action: string
  module: string
  message: string
  userId: string
  userName: string
  oldValue?: string
  newValue?: string
  reason?: string
  createdAt: string
}

export type RefundPolicy = 'cash' | 'store-credit' | 'exchange'

export type SettingsRecord = {
  companyName: string
  currency: string
  timezone: string
  returnWindowDays: number
  refundPolicy: RefundPolicy
  restockOnReturn: boolean
}

// Section 29 (Automatic Accounting Engine): every expense auto-posts
// Dr <matching expense account> / Cr Cash-or-Bank — see
// resolveExpenseLedgerAccount in provider.tsx for the category→account map.
export type ExpensePaymentMethod = 'cash' | 'bank'

// Section 36 (Expense Approval Workflow): an expense posts to the ledger
// immediately at entry (same "post first, approve as a review gate" shape
// as Sales Order approval) and sits at "pending" until someone with
// finance:edit approves or rejects it — see updateExpenseApproval in
// provider.tsx. Expenses recorded before this workflow existed normalize to
// "approved" (see normalizeExpenseRecord) so they don't retroactively show
// up as awaiting approval.
export type ExpenseApprovalStatus = 'pending' | 'approved' | 'rejected'

export type ExpenseRecord = {
  id: string
  category: string
  amount: number
  note: string
  date: string
  paymentMethod?: ExpensePaymentMethod
  approvalStatus: ExpenseApprovalStatus
  approvedBy: string
  approvedByName: string
  approvedAt: string
  createdBy: string
  createdByName: string
  createdAt: string
}

// Section 37 (Budget Management): a plan for one expense category over one
// month or one calendar year. "Actual" is intentionally never stored here —
// it's the live sum of ExpenseRecords in that category+period, computed by
// getBudgetActual (provider.tsx) and reused by the Accounting page's Budget
// tab and by the overrun-alert check that runs every time an expense is
// saved. `month` is 1-12 for a monthly budget and 0 (not applicable) for a
// yearly one — kept as a plain number, not optional/undefined, since the
// Firebase Realtime Database write rejects undefined property values.
export type BudgetPeriodType = 'monthly' | 'yearly'

export type BudgetRecord = {
  id: string
  category: string
  periodType: BudgetPeriodType
  year: number
  month: number
  budgetAmount: number
  note: string
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

export type BudgetInput = {
  category: string
  periodType: BudgetPeriodType
  year: number
  month?: number
  budgetAmount: number
  note?: string
}

// ---- Sales Target (Section 41) ------------------------------------------
// Achievement is deliberately never stored — like Budget's Actual, it is
// the live sum of net sales for the matching orders in that period, so it
// can never drift from the books (see achievedAmountFor in dashboards.ts).
// 'dealer' targets key off one specific dealer (entityId = DealerRecord.id).
export type SalesTargetEntityType = 'sales-officer' | 'dealer'

export type SalesTargetRecord = {
  id: string
  period: string // 'YYYY-MM'
  entityType: SalesTargetEntityType
  entityId: string
  entityName: string
  targetAmount: number
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

export type SalesTargetInput = {
  period: string
  entityType: SalesTargetEntityType
  entityId: string
  entityName?: string
  targetAmount: number
}

// ---- Commission Management (Section 42) ---------------------------------
// A rule is either a sales-value slab table (e.g. "Sales > 10 lakh => 5%")
// or a per-product rate table. Like the slab/product split in the spec,
// only one of `slabs`/`productRates` is meaningful for a given ruleType.
export type CommissionAppliesTo = 'sales-officer' | 'dealer'
export type CommissionRuleType = 'slab' | 'product'

export type CommissionSlab = {
  minSales: number
  maxSales: number | null // null = no upper bound
  percentage: number
}

export type CommissionProductRate = {
  productId: string
  productName: string
  percentage: number
}

export type CommissionRuleRecord = {
  id: string
  name: string
  appliesTo: CommissionAppliesTo
  ruleType: CommissionRuleType
  slabs: CommissionSlab[]
  productRates: CommissionProductRate[]
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt: string
}

export type CommissionRuleInput = {
  name: string
  appliesTo: CommissionAppliesTo
  ruleType: CommissionRuleType
  slabs?: CommissionSlab[]
  productRates?: CommissionProductRate[]
  status?: 'active' | 'inactive'
}

// The System auto-calculates commission (rule x period sales) live in the
// UI, same as Budget's Actual — this record only exists once that computed
// figure is actually paid out, so it doubles as the payment receipt and
// posts Dr Commission / Cr Cash-or-Bank to the ledger.
export type CommissionPayoutRecord = {
  id: string
  receiptNumber: string
  period: string
  appliesTo: CommissionAppliesTo
  entityId: string
  entityName: string
  ruleId: string
  ruleName: string
  salesAmount: number
  commissionAmount: number
  paymentMethod: 'cash' | 'bank'
  paidBy: string
  paidByName: string
  createdAt: string
}

export type CommissionPayoutInput = {
  period: string
  appliesTo: CommissionAppliesTo
  entityId: string
  entityName: string
  ruleId: string
  salesAmount: number
  commissionAmount: number
  paymentMethod?: 'cash' | 'bank'
}

export type ERPData = {
  permissions: Record<string, PermissionDefinition>
  roles: Record<string, RoleRecord>
  users: Record<string, UserRecord>
  dealers: Record<string, DealerRecord>
  products: Record<string, ProductRecord>
  orders: Record<string, OrderRecord>
  ledgerEntries: Record<string, LedgerEntryRecord>
  chartOfAccounts: Record<string, ChartOfAccountRecord>
  journalEntries: Record<string, JournalEntryRecord>
  bankAccounts: Record<string, BankAccountRecord>
  bankTransactions: Record<string, BankTransactionRecord>
  salesReturns: Record<string, SalesReturnRecord>
  collections: Record<string, CollectionRecord>
  batches: Record<string, BatchRecord>
  stockAdjustments: Record<string, StockAdjustmentRecord>
  stockCounts: Record<string, StockCountRecord>
  rateCards: Record<string, RateCardRecord>
  qualityChecks: Record<string, QualityCheckRecord>
  qcHolds: Record<string, QcHoldRecord>
  notifications: Record<string, NotificationRecord>
  activities: Record<string, ActivityRecord>
  loginHistory: Record<string, LoginHistoryRecord>
  expenses: Record<string, ExpenseRecord>
  budgets: Record<string, BudgetRecord>
  salesTargets: Record<string, SalesTargetRecord>
  commissionRules: Record<string, CommissionRuleRecord>
  commissionPayouts: Record<string, CommissionPayoutRecord>
  investors: Record<string, InvestorRecord>
  settings: SettingsRecord
  meta: {
    seededAt: string
    version: string
  }
}

export type InvestorRecord = {
  id: string
  name: string
  location: string
  mobile: string
  products: string
  amount: number
  note: string
  createdAt: string
  updatedAt: string
}

export type ProductInput = {
  name: string
  banglaName?: string
  englishName?: string
  category?: string
  subCategory?: string
  brand?: string
  productType?: string
  sku: string
  serialNumber?: string
  warrantyMonths?: number
  unit?: string
  purchaseUnit?: string
  salesUnit?: string
  conversionRatio?: number
  packSize?: string
  weight?: number
  purchasePrice: number
  sellingPrice: number
  wholesalePrice?: number
  mrp?: number
  dealerPrice?: number
  distributorPrice?: number
  minSellingPrice?: number
  batchApplicable?: boolean
  expiryApplicable?: boolean
  isActive?: boolean
  stockQty: number
  minStock: number
  maxStock?: number
  description?: string
  imageUrl?: string
  imagePublicId?: string
}

export type DealerInput = {
  name: string
  address?: string
  phone: string
}

export type OrderInput = {
  dealerId: string
  items: Array<{
    productId: string
    quantity: number
    unitPrice: number
  }>
  discount?: number
  promotionalDiscount?: number
  vat?: number
  paid: number
  deliveryDate: string
  billNumber?: string
  orderDate?: string
  paymentDueDate?: string
  dueReference?: OrderRecord['dueReference']
  priceMode?: PriceMode
  remarks?: string
}

export type ExpenseInput = {
  category: string
  amount: number
  note?: string
  date?: string
  paymentMethod?: ExpensePaymentMethod
}

export type InvestorInput = {
  name: string
  location?: string
  mobile: string
  products?: string
  amount: number
  note?: string
}

export type SettingsInput = {
  companyName: string
  currency: string
  timezone: string
  returnWindowDays: number
  refundPolicy: RefundPolicy
  restockOnReturn: boolean
}

export type UserInput = {
  name: string
  loginId: string
  phone: string
  // Only used (and required) when creating a new user — it seeds the
  // Firebase Auth account. Updating an existing user never touches their
  // password; that goes through a password-reset email instead.
  password?: string
  roleId: string
  title: string
}
