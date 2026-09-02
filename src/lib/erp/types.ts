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

export type WarehouseRecord = {
  id: string
  name: string
  location: string
}

export type SupplierRecord = {
  id: string
  supplierCode?: string
  name: string
  company: string
  contactPerson?: string
  phone: string
  email: string
  location: string
  productCategory?: string
  supplierType: 'local' | 'foreign' | 'importer'
  country: string
  lcNumber: string
  lcStatus: 'not-required' | 'pending' | 'opened' | 'released' | 'closed'
  productCost: number
  shippingCost: number
  customsDuty: number
  otherCost: number
  currency: string
  paymentTerms?: string
  creditDays?: number
  openingBalance?: number
  bankAccount?: string
  supplierRating?: number
  status?: 'active' | 'inactive'
  notes: string
  createdAt: string
  updatedAt: string
}

export type CustomerType = 'retailer' | 'wholesaler' | 'distributor' | 'dealer' | 'corporate'

export type CustomerRecord = {
  id: string
  customerCode?: string
  name: string
  company: string
  ownerName?: string
  phone: string
  location: string
  district?: string
  territory?: string
  salesArea?: string
  salesOfficerId?: string
  customerType?: CustomerType
  creditLimit?: number
  creditDays?: number
  openingBalance?: number
  paymentTerms?: string
  priceCategory?: string
  discountCategory?: string
  bankInformation?: string
  status?: 'active' | 'inactive'
  due: number
  supportStatus: 'none' | 'needed' | 'in-progress' | 'resolved'
  supportNote: string
  isPremium: boolean
  isWholesale?: boolean
  leadSource?: 'facebook' | 'local-marketing' | 'visiting-customer'
  reminderCustomer?: boolean
  previousBillNumber?: string
  previousPurchaseDetails?: string
  previousPurchaseAmount?: number
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
  warehouseId: string
  supplierId: string
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
  customerId: string
  customerName: string
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
  warehouseId?: string
  deliveryDate: string
  paymentDueDate: string
  dueReference: 'owner' | 'courier' | 'bank' | 'bkash' | 'nagad' | 'dbbl' | ''
  overdueNotified?: boolean
  remarks?: string
  createdAt: string
  items: OrderItem[]
  // Section 49 — Sales Approval Workflow: approval is only required for the
  // three special cases the spec lists (Credit Limit Exceeded / Special
  // Discount / Below Minimum Price); a plain order skips straight to
  // "approved". This records which condition(s) actually fired, so an
  // approver (Sales Manager / Finance-Credit Control / Management — gated
  // on the existing orders:approve permission, same simplification already
  // used for this single-stage gate) can see why the order needs sign-off.
  approvalReasons?: string[]
}

// One ledger entry per debit or credit leg of the auto-posted double entry
// (see createOrder / cancelOrder / receivePurchaseOrder / createSalesReturn
// in provider.tsx). `orderId`/`billNumber` double as a generic reference id
// and document number — a sales order for invoice/collection entries, a
// purchase order for GRN/accounts-payable entries, a sales return for
// return-adjustment entries, an expense for expense-payment entries, or a
// journal entry for a manual posting (see Section 27-29).
//
// This is the fixed set of *system* posting keys the Automatic Accounting
// Engine already knows how to write to on its own (Sales, Purchase, Sales
// Cost, Customer Collection, Supplier Payment, Expense — Section 29). Every
// other Chart of Accounts account (Section 28) that has no automatic
// posting wired up yet — Bank, Raw Material, Finished Goods, Fixed Assets,
// Advance, Bank Loan, Other Payable, Share Capital, Retained Earnings,
// Other Income — is posted to only via a manual Journal Entry, using the
// 'manual' key with `accountRef` holding the actual ChartOfAccountRecord id
// (see resolveLedgerAccount in the accounting page for how the two schemes
// are reconciled into one General Ledger).
export type LedgerAccount =
  | 'customer'
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

// ---- Purchase Requisition (Section 13) ----------------------------------
// System-generated whenever a product's stock falls below its reorder
// level (minStock) — see maybeCreatePurchaseRequisition in provider.tsx.
export type PurchaseRequisitionStatus = 'open' | 'ordered' | 'dismissed'

export type PurchaseRequisitionRecord = {
  id: string
  productId: string
  productName: string
  currentStock: number
  reorderLevel: number
  suggestedQty: number
  status: PurchaseRequisitionStatus
  note: string
  createdAt: string
  updatedAt: string
}

// ---- Purchase Order / GRN (Sections 12 & 14) ----------------------------
export type PurchaseOrderItem = {
  productId: string
  productName: string
  quantity: number
  unitCost: number
  receivedQuantity: number
  rejectedQuantity: number
  batchNumber?: string
  manufacturingDate?: string
  expiryDate?: string
}

export type PurchaseOrderStatus = 'ordered' | 'received' | 'cancelled'
export type QualityCheckStatus = 'pending' | 'passed' | 'failed' | 'partial'
export type BillStatus = 'unbilled' | 'billed' | 'paid'

// ---- Purchase Approval Workflow (Section 48) -----------------------------
// Requester (implicit — whoever submits the PO) → Department Head →
// Purchase Manager → Finance → Management. A purchase order can only be
// received (goods/GRN take effect) once it has cleared every stage —
// "Approval অনুযায়ী Purchase Order হবে".
export type PurchaseApprovalStage = 'department_head' | 'purchase_manager' | 'finance' | 'management' | 'completed'

export type PurchaseOrderApproval = {
  stage: Exclude<PurchaseApprovalStage, 'completed'>
  status: 'approved' | 'rejected'
  byUserId: string
  byUserName: string
  note: string
  at: string
}

export type PurchaseOrderRecord = {
  id: string
  poNumber: string
  requisitionId?: string
  supplierId: string
  supplierName: string
  warehouseId: string
  warehouseName: string
  items: PurchaseOrderItem[]
  currency: string
  subtotal: number
  status: PurchaseOrderStatus
  qualityCheckStatus: QualityCheckStatus
  qualityCheckNote: string
  grnNumber: string
  // GRN cost roll-up (Section 14): landed cost = goods + transport + other.
  transportCost: number
  otherCost: number
  totalLandedCost: number
  billStatus: BillStatus
  paid: number
  due: number
  expectedDate: string
  approvalStatus: ApprovalStatus
  approvalStage: PurchaseApprovalStage
  approvals: PurchaseOrderApproval[]
  createdAt: string
  updatedAt: string
}

export type PurchaseOrderInput = {
  requisitionId?: string
  supplierId: string
  warehouseId: string
  items: Array<{ productId: string; quantity: number; unitCost: number }>
  currency?: string
  expectedDate?: string
}

export type PurchaseReceiveInput = {
  items: Array<{
    productId: string
    receivedQuantity: number
    rejectedQuantity?: number
    batchNumber?: string
    manufacturingDate?: string
    expiryDate?: string
  }>
  qualityCheckNote?: string
  grnNumber?: string
  transportCost?: number
  otherCost?: number
  qc?: QualityCheckInput
}

// ---- Purchase Return (Section 30 — Supplier Payable ledger) -------------
// The supplier-side counterpart of Sales Return: goods already received
// (and stocked) on a GRN'd purchase order go back to the supplier, stock
// comes back out, and whatever's still unpaid on that PO is reduced.
export type PurchaseReturnItem = {
  productId: string
  productName: string
  quantity: number
  unitCost: number
}

export type PurchaseReturnRecord = {
  id: string
  returnNumber: string
  purchaseOrderId: string
  poNumber: string
  supplierId: string
  supplierName: string
  warehouseId: string
  warehouseName: string
  items: PurchaseReturnItem[]
  totalValue: number
  reason: string
  processedBy: string
  processedByName: string
  createdAt: string
}

export type PurchaseReturnInput = {
  purchaseOrderId: string
  items: Array<{ productId: string; quantity: number }>
  reason?: string
}

// ---- Per-warehouse stock (Sections 15-17) -------------------------------
// `ProductRecord.stockQty` stays the company-wide total (everything that
// already reads it keeps working); this is the real-time breakdown of
// where that total physically sits, one row per product+warehouse.
export type WarehouseStockRecord = {
  id: string
  productId: string
  productName: string
  warehouseId: string
  quantity: number
  updatedAt: string
}

// ---- Stock Transfer (Section 17) ----------------------------------------
export type StockTransferStatus = 'requested' | 'approved' | 'in-transit' | 'received' | 'rejected' | 'cancelled'

export type StockTransferRecord = {
  id: string
  transferNumber: string
  productId: string
  productName: string
  fromWarehouseId: string
  fromWarehouseName: string
  toWarehouseId: string
  toWarehouseName: string
  quantity: number
  status: StockTransferStatus
  note: string
  requestedBy: string
  requestedByName: string
  approvedBy: string
  approvedByName: string
  createdAt: string
  updatedAt: string
}

export type StockTransferInput = {
  productId: string
  fromWarehouseId: string
  toWarehouseId: string
  quantity: number
  note?: string
}

// ---- Batches / FIFO-FEFO (Section 18) -----------------------------------
// Created at GRN time (see receivePurchaseOrder) whenever a received line
// carries a batch number or expiry date. A sale now genuinely consumes the
// soonest-expiring batch(es) first (see consumeBatchesFefo/createOrder in
// provider.tsx) — quantity here decreases as an order is created/edited and
// is restored on cancel/edit-away, same reverse-then-repost pattern as the
// rest of the sale's stock/ledger effects.
export type BatchRecord = {
  id: string
  productId: string
  productName: string
  warehouseId: string
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
  warehouseId: string
  warehouseName: string
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
  warehouseId: string
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
  warehouseId: string
  warehouseName: string
  items: StockCountItem[]
  countedBy: string
  countedByName: string
  createdAt: string
}

export type StockCountInput = {
  warehouseId: string
  items: Array<{ productId: string; physicalQty: number }>
}

// ---- Manufacturing / BOM (Section 21) ------------------------------------
// Sections 22-23: a BOM *is* the Recipe/Formula — every finished product's
// formula, versioned. Editing one never mutates or deletes the old record
// (see saveBillOfMaterial in provider.tsx): it writes a brand-new id with
// version = previous + 1, links back via previousVersionId, and flips the
// old version's isActive off. Only an approved, active version can be used
// to plan new production.
export type BomComponent = {
  productId: string
  productName: string
  quantityPerBatch: number
  percentage?: number
}

export type BomApprovalStatus = 'draft' | 'approved' | 'rejected'

export type BillOfMaterialRecord = {
  id: string
  formulaCode: string
  finishedProductId: string
  finishedProductName: string
  version: number
  previousVersionId: string
  isActive: boolean
  outputQuantity: number
  expectedYieldPercentage: number
  processingLossPercentage: number
  packagingRequirement: string
  components: BomComponent[]
  approvalStatus: BomApprovalStatus
  approvedBy: string
  approvedByName: string
  createdAt: string
  updatedAt: string
}

export type BillOfMaterialInput = {
  finishedProductId: string
  outputQuantity: number
  expectedYieldPercentage?: number
  processingLossPercentage?: number
  packagingRequirement?: string
  components: Array<{ productId: string; quantityPerBatch: number; percentage?: number }>
}

export type ProductionOrderStatus = 'planned' | 'material-issued' | 'completed' | 'cancelled'
export type ProductionQualityStatus = 'pending' | 'passed' | 'failed'

export type ProductionMaterialLine = {
  productId: string
  productName: string
  requiredQty: number
  issuedQty: number
  unitCost: number
}

// Section 24 (Production Cost): every component is tracked separately so
// Total Production Cost ÷ Finished Quantity = Unit Production Cost is a
// real, auditable sum rather than one lump "overhead" figure.
export type ProductionOrderRecord = {
  id: string
  productionNumber: string
  bomId: string
  finishedProductId: string
  finishedProductName: string
  warehouseId: string
  warehouseName: string
  plannedBatches: number
  plannedOutputQty: number
  materials: ProductionMaterialLine[]
  status: ProductionOrderStatus
  qualityCheckStatus: ProductionQualityStatus
  qualityCheckNote: string
  finishedGoodsQty: number
  // Section 26: goods produced from a failed QC don't reach sellable stock
  // — they're recorded here and mirrored into a QcHoldRecord instead.
  qcHoldQty: number
  rawMaterialCost: number
  packagingCost: number
  directLabourCost: number
  electricityCost: number
  gasFuelCost: number
  factoryOverheadCost: number
  processingCost: number
  otherCost: number
  totalCost: number
  unitCost: number
  // Section 25 (Production Loss): planned vs. actual output variance —
  // the recipe's processingLossPercentage is the "standard loss" this is
  // compared against.
  productionLossQty: number
  productionLossPercentage: number
  varianceAlert: boolean
  createdAt: string
  updatedAt: string
}

export type ProductionOrderInput = {
  bomId: string
  warehouseId: string
  plannedBatches: number
}

// ---- Quality Control (Section 26) ---------------------------------------
// One QC module, used from both Production (completeProduction) and
// Purchase (receivePurchaseOrder) — the detailed lab-test parameters.
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
// stock/warehouseStocks until explicitly released (back to stock) or
// scrapped (written off for good). This is what "Fail হলে ... Sales-এ
// যাবে না" (won't go to Sales) actually enforces.
export type QcHoldStatus = 'held' | 'released' | 'scrapped'

export type QcHoldRecord = {
  id: string
  sourceType: QcSourceType
  sourceId: string
  sourceReference: string
  productId: string
  productName: string
  warehouseId: string
  warehouseName: string
  quantity: number
  unitCost: number
  reason: string
  status: QcHoldStatus
  createdAt: string
  updatedAt: string
}

export type ProductionCompleteInput = {
  finishedGoodsQty: number
  qualityCheckStatus: ProductionQualityStatus
  qualityCheckNote?: string
  directLabourCost?: number
  electricityCost?: number
  gasFuelCost?: number
  factoryOverheadCost?: number
  processingCost?: number
  otherCost?: number
  qc?: QualityCheckInput
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
  customerId: string
  customerName: string
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
  customerId: string
  customerName: string
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

export type PurchaseRecord = {
  id: string
  productId: string
  productName: string
  supplierId: string
  supplierName: string
  quantity: number
  unitCost: number
  currency: string
  total: number
  status: 'pending' | 'received'
  createdAt: string
}

export type TaskStatus = 'pending' | 'in-progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export type TaskRecord = {
  id: string
  title: string
  description: string
  module: 'inventory' | 'sales' | 'support' | 'warehouse'
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string
  assigneeName: string
  dueDate: string
  createdBy: string
  createdAt: string
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

// ---- Sales Force Management (Section 40) -------------------------------
// A "Sales Officer" has no separate master — it is a UserRecord whose role
// carries 'orders:create' (the same identity already stamped on every
// OrderRecord as salesPersonId/salesPersonName). Route just groups a
// territory's customers under one officer for a visit plan.
export type RouteRecord = {
  id: string
  routeCode?: string
  routeName: string
  territory?: string
  salesArea?: string
  salesOfficerId: string
  salesOfficerName: string
  customerIds: string[]
  status: 'active' | 'inactive'
  notes: string
  createdAt: string
  updatedAt: string
}

export type RouteInput = {
  routeCode?: string
  routeName: string
  territory?: string
  salesArea?: string
  salesOfficerId: string
  customerIds?: string[]
  status?: 'active' | 'inactive'
  notes?: string
}

// A visit optionally links back to the Order/Collection it produced so the
// Sales Officer dashboard can roll visits up into real order/collection
// figures instead of just a call count.
export type VisitOutcome = 'order-placed' | 'collection-made' | 'order-and-collection' | 'no-order' | 'store-closed'

export type CustomerVisitRecord = {
  id: string
  visitDate: string
  salesOfficerId: string
  salesOfficerName: string
  customerId: string
  customerName: string
  routeId?: string
  routeName?: string
  territory?: string
  outcome: VisitOutcome
  orderId?: string
  orderAmount?: number
  collectionId?: string
  collectionAmount?: number
  remarks: string
  createdAt: string
}

export type CustomerVisitInput = {
  visitDate?: string
  salesOfficerId: string
  customerId: string
  routeId?: string
  outcome: VisitOutcome
  orderId?: string
  collectionId?: string
  remarks?: string
}

// ---- Route Visit Schedule / "Beat Plan" (Section 45) --------------------
// The planned counterpart to CustomerVisitRecord above: which customers on
// a route a Sales Officer is due to call on a given weekday, decided ahead
// of time. Logging an actual CustomerVisitRecord against that same
// route/customer is how the plan gets checked off — this record itself
// never marks "done".
export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export type RouteVisitScheduleRecord = {
  id: string
  routeId: string
  routeName: string
  salesOfficerId: string
  salesOfficerName: string
  territory?: string
  dayOfWeek: Weekday
  customerIds: string[]
  status: 'active' | 'inactive'
  notes: string
  createdAt: string
  updatedAt: string
}

export type RouteVisitScheduleInput = {
  routeId: string
  dayOfWeek: Weekday
  customerIds?: string[]
  status?: 'active' | 'inactive'
  notes?: string
}

// ---- Sales Target (Section 41) ------------------------------------------
// Achievement is deliberately never stored — like Budget's Actual, it is
// the live sum of net sales for the matching orders in that period, so it
// can never drift from the books (see entitySalesAmount in the Sales
// Force page). 'territory'/'sales-area' targets key off the matching free-
// text field on CustomerRecord (there is no separate Territory master);
// 'distributor' targets key off one specific distributor/dealer customer.
export type SalesTargetEntityType = 'sales-officer' | 'territory' | 'sales-area' | 'distributor'

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

export type SellerRecord = {
  id: string
  name: string
  phone: string
  location: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type SellerTransactionRecord = {
  id: string
  sellerId: string
  sellerName: string
  date: string
  productName: string
  quantity: number
  takenValue: number
  cashGiven: number
  givenValue: number
  cashReceived: number
  goodsBroughtDescription: string
  iReceiveAmount: number
  theyReceiveAmount: number
  createdAt: string
}

export type CourierStatus = 'in-transit' | 'delivered' | 'returned' | 'cod-collected'

export type CourierRecord = {
  id: string
  orderId?: string
  customerId?: string
  customerName: string
  billNumber: string
  courierName: string
  productDescription: string
  quantity: number
  codAmount: number
  sentDate: string
  status: CourierStatus
  createdAt: string
  updatedAt: string
}

export type ERPData = {
  permissions: Record<string, PermissionDefinition>
  roles: Record<string, RoleRecord>
  users: Record<string, UserRecord>
  warehouses: Record<string, WarehouseRecord>
  suppliers: Record<string, SupplierRecord>
  customers: Record<string, CustomerRecord>
  products: Record<string, ProductRecord>
  orders: Record<string, OrderRecord>
  ledgerEntries: Record<string, LedgerEntryRecord>
  chartOfAccounts: Record<string, ChartOfAccountRecord>
  journalEntries: Record<string, JournalEntryRecord>
  bankAccounts: Record<string, BankAccountRecord>
  bankTransactions: Record<string, BankTransactionRecord>
  purchaseRequisitions: Record<string, PurchaseRequisitionRecord>
  purchaseOrders: Record<string, PurchaseOrderRecord>
  purchaseReturns: Record<string, PurchaseReturnRecord>
  salesReturns: Record<string, SalesReturnRecord>
  collections: Record<string, CollectionRecord>
  warehouseStocks: Record<string, WarehouseStockRecord>
  stockTransfers: Record<string, StockTransferRecord>
  batches: Record<string, BatchRecord>
  stockAdjustments: Record<string, StockAdjustmentRecord>
  stockCounts: Record<string, StockCountRecord>
  billOfMaterials: Record<string, BillOfMaterialRecord>
  productionOrders: Record<string, ProductionOrderRecord>
  qualityChecks: Record<string, QualityCheckRecord>
  qcHolds: Record<string, QcHoldRecord>
  purchases: Record<string, PurchaseRecord>
  tasks: Record<string, TaskRecord>
  notifications: Record<string, NotificationRecord>
  activities: Record<string, ActivityRecord>
  loginHistory: Record<string, LoginHistoryRecord>
  expenses: Record<string, ExpenseRecord>
  budgets: Record<string, BudgetRecord>
  routes: Record<string, RouteRecord>
  customerVisits: Record<string, CustomerVisitRecord>
  routeVisitSchedules: Record<string, RouteVisitScheduleRecord>
  salesTargets: Record<string, SalesTargetRecord>
  commissionRules: Record<string, CommissionRuleRecord>
  commissionPayouts: Record<string, CommissionPayoutRecord>
  sellers: Record<string, SellerRecord>
  sellerTransactions: Record<string, SellerTransactionRecord>
  couriers: Record<string, CourierRecord>
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
  warehouseId: string
  supplierId?: string
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

export type WarehouseInput = {
  name: string
  location: string
}

export type CustomerInput = {
  customerCode?: string
  name: string
  company?: string
  ownerName?: string
  phone: string
  location?: string
  district?: string
  territory?: string
  salesArea?: string
  salesOfficerId?: string
  customerType?: CustomerType
  creditLimit?: number
  creditDays?: number
  openingBalance?: number
  paymentTerms?: string
  priceCategory?: string
  discountCategory?: string
  bankInformation?: string
  status?: CustomerRecord['status']
  due?: number
  supportStatus?: CustomerRecord['supportStatus']
  supportNote?: string
  isPremium?: boolean
  isWholesale?: boolean
  leadSource?: CustomerRecord['leadSource']
  reminderCustomer?: boolean
  previousBillNumber?: string
  previousPurchaseDetails?: string
  previousPurchaseAmount?: number
}

export type SupplierInput = {
  supplierCode?: string
  name: string
  company?: string
  contactPerson?: string
  phone: string
  email?: string
  location?: string
  productCategory?: string
  supplierType?: SupplierRecord['supplierType']
  country?: string
  lcNumber?: string
  lcStatus?: SupplierRecord['lcStatus']
  productCost?: number
  shippingCost?: number
  customsDuty?: number
  otherCost?: number
  currency?: string
  paymentTerms?: string
  creditDays?: number
  openingBalance?: number
  bankAccount?: string
  supplierRating?: number
  status?: SupplierRecord['status']
  notes?: string
}

export type PurchaseInput = {
  productId: string
  quantity: number
  unitCost: number
  supplierId: string
  currency: string
}

export type OrderInput = {
  customerId: string
  items: Array<{
    productId: string
    quantity: number
    unitPrice: number
  }>
  discount?: number
  promotionalDiscount?: number
  vat?: number
  paid: number
  warehouseId?: string
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

export type SellerInput = {
  name: string
  phone: string
  location?: string
  notes?: string
}

export type SellerTransactionInput = {
  sellerId: string
  date?: string
  productName?: string
  quantity?: number
  takenValue?: number
  cashGiven?: number
  givenValue?: number
  cashReceived?: number
  goodsBroughtDescription?: string
  iReceiveAmount?: number
  theyReceiveAmount?: number
}

export type CourierInput = {
  orderId?: string
  customerId?: string
  customerName: string
  billNumber?: string
  courierName: string
  productDescription: string
  quantity: number
  codAmount: number
  sentDate?: string
}

export type TaskInput = {
  title: string
  description: string
  module: TaskRecord['module']
  priority: TaskPriority
  assigneeId: string
  dueDate: string
}

export type SettingsInput = {
  companyName: string
  currency: string
  timezone: string
  returnWindowDays: number
  refundPolicy: RefundPolicy
  restockOnReturn: boolean
}

// ---- Data Migration (Section 81) ----------------------------------------
export type ImportRowError = { row: number; message: string }
export type ImportResult = { imported: number; errors: ImportRowError[] }
export type OpeningStockRow = { sku: string; quantity: number; warehouseId?: string }
// `match` is a customer/supplier code or phone number — whichever the sheet
// gives; importOpeningReceivable/importOpeningPayable try both.
export type OpeningBalanceRow = { match: string; amount: number }

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
