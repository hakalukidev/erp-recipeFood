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
// `name` is the dealer's business/shop name; `proprietorName` is the owner's
// personal name (optional — not every dealer record has one on file).
// `categoryId` links to a DealerCategoryRecord below (e.g. Wholesaler,
// Retailer, Distributor) — optional, and '' / missing means uncategorized.
export type DealerRecord = {
  id: string
  name: string
  proprietorName: string
  address: string
  phone: string
  categoryId?: string
  // Which Depot this dealer is served through — links to a DepotRecord below.
  // Optional (older dealers, or a dealer served directly by the company, have
  // none); lets an invoice's "From" party show the actual depot that issues
  // it instead of the generic placeholder text "Depot", so two dealers under
  // different depots print visibly different vouchers. See depotId in
  // buildDealerInvoiceHtml in app/admin/rate-card/page.tsx.
  depotId?: string
  createdAt: string
  updatedAt: string
}

// A simple named grouping for dealers (e.g. Wholesaler, Retailer, Distributor)
// managed from its own "Dealer Category" admin section — just a name, nothing more.
export type DealerCategoryRecord = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

// A depot is the middle party in the Company → Depot → Dealer chain — same
// shape as DealerRecord (business name, an optional proprietor name, phone,
// address) since it's printed on invoices the same way. A dealer links to
// the depot that serves it via DealerRecord.depotId; the Dealer voucher's
// "From" party box then prints this depot's own name/address/phone instead
// of a hardcoded "Depot" label.
export type DepotRecord = {
  id: string
  name: string
  proprietorName: string
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
  // Pieces per carton — required, shown as "(N)" on the product name and
  // used to multiply Qty into total pieces on a Rate Card line (see
  // parsePerCtnMultiplier in utils.ts).
  packSize: string
  weight?: number
  purchasePrice: number
  sellingPrice: number
  wholesalePrice: number
  mrp?: number
  dealerPrice?: number
  distributorPrice?: number
  minSellingPrice?: number
  // Rate Card defaults — the same six rate columns a Rate Card line item
  // carries (see RateCardLineItem), stored here so a new line can prefill
  // from the product instead of being retyped every time. Independent of
  // purchasePrice/sellingPrice/etc. above, which drive stock valuation and
  // the (currently unreachable) Sales Order module.
  rawRate?: number
  manufRate?: number
  depotRate?: number
  dealerRate?: number
  tpRate?: number
  mrpRate?: number
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
//   Dealer voucher   — DP (= dealerRate) / TP (= tpRate)
//   mrpRate — the end-consumer price (Maximum Retail Price), one step past
//     TP; not printed on any of the three depot-chain vouchers above (none
//     of the client's paper invoices show it — they stop at TP) but kept on
//     the line item/totals so it's on record for whoever prices the shelf.
// See computeRateCardTotals in provider.tsx for the totals below:
//   pouchCartonAmount = manufRateTotal − rawRateTotal
//   usableMoney        = depotRateTotal − manufRateTotal   (margin up to Depot)
//   usableUDepot        = dealerRateTotal − manufRateTotal  (margin skipping Depot)
//   both percentages are the figure above ÷ dealerRateTotal
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
  // Only meaningful when the invoice this line belongs to has
  // saleType:'commission' and the line was picked from the Discount Product
  // List (see DiscountProductRecord) rather than the regular Product List —
  // the SR Commission %/TP % actually applied at billing time, copied in at
  // save time (not looked up live) so the printed voucher stays correct even
  // if the Discount Product List's own percentages change later. Absent/0 on
  // a line sourced from the regular Product List.
  srCommissionPercent?: number
  tpPercent?: number
}

// Which pricing chain this invoice was billed under — chosen on the invoice
// form (see the Sale type selector in rate-card/page.tsx) and used to split
// the Sales Reports section (see buildSalesReportSummary in utils.ts) into
// "Commission-based" vs "Others" totals. The Sale type selector lists the
// live Dealer Category list (DealerCategoryRecord) instead of a fixed pair of
// options, so this now holds a dealer category id — plus, for invoices saved
// before that switch (or classified later from the Sales Reports
// "Unclassified" list), the legacy 'commission' | 'others' literal. Use
// isCommissionSaleType()/saleTypeLabel() in utils.ts rather than comparing
// against 'commission' directly — a dealer category counts as commission-style
// when its name contains "commission" (case-insensitive). Invoices with no
// saleType at all are reported as "Unclassified" rather than silently
// bucketed into either side.
export type SaleType = string

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
  saleType?: SaleType
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
  createdAt: string
  updatedAt: string
}

export type RateCardInput = {
  invoiceNo: string
  recipientName: string
  date: string
  deliveryDate?: string
  dealerId?: string
  saleType?: SaleType
  items: RateCardLineItem[]
  remarks?: string
}

// ---- Discount Product List -----------------------------------------------
// A second price catalog mirroring every rate column on the printed Rate
// Card (Raw M → Manu R → Depot P R → Depot S R → SR Com +N% → TP+N% → MRP),
// for the flat-rate/commission-based selling chain rather than the
// depot-invoice chain ProductRecord's six rate fields feed. Same field names
// as ProductRecord (rawRate/manufRate/depotRate/dealerRate/mrpRate) for the
// unit-rate columns already shared with it, plus the two percentage columns
// that drive this flat-rate chain — depotRate, dealerRate (Depot S R is typed
// in by hand, not a Depot markup percentage) and mrpRate (set independently)
// are all typed in directly; SR Rate and TP Rate are percentage steps off the
// rate before them, computed and re-saved on every save (see
// computeDiscountProductRates in utils.ts, which is also what the UI calls
// live for the on-screen preview):
//   rawRate              -- "Raw M" column: raw material cost per unit
//   manufRate            -- "Manu R" column: manufacturing cost per unit
//   depotRate            -- "Depot P R" column: what Depot pays (purchase)
//   dealerRate           -- "Depot S R" column: Depot's selling rate, typed
//     in manually (no automatic markup off depotRate)
//   srCommissionPercent  -- SR's cut added on top ("SR Com +N%" column) ->
//     srRate = dealerRate * (1 + srCommissionPercent / 100)
//   tpPercent            -- further markup to Trade Price ("TP+N%" column) ->
//     tpRate = srRate * (1 + tpPercent / 100)
//   mrpRate              -- end-consumer price, set independently — not a
//     percentage step off tpRate the way SR/TP Rate are off each other
export type DiscountProductRecord = {
  id: string
  name: string
  banglaName?: string
  category?: string
  // Pieces per carton/bag, e.g. "06 ps = 1 bg" — same role as ProductRecord's
  // packSize/RateCardLineItem's perCtnBgs.
  perCtnBgs?: string
  rawRate: number
  manufRate: number
  depotRate: number
  // Depot's selling rate, typed in by hand — see comment above.
  dealerRate: number
  srCommissionPercent: number
  tpPercent: number
  mrpRate: number
  isActive?: boolean
  createdAt: string
  updatedAt: string
}

export type DiscountProductInput = {
  name: string
  banglaName?: string
  category?: string
  perCtnBgs?: string
  rawRate?: number
  manufRate?: number
  depotRate?: number
  dealerRate?: number
  srCommissionPercent?: number
  tpPercent?: number
  mrpRate?: number
  isActive?: boolean
}

// ---- Trade Sales Product List --------------------------------------------
// A third price catalog, for hubs where the company runs a depot but has no
// dealer under it — the company manufactures and sells retail directly
// through its own staff there. Same rate-card chain as ProductRecord (Raw M
// → Manu R → Depot P R → Depot S R → TP → MRP, all typed in directly, no
// percentage-derived steps like the Discount Product List's SR Com/TP %) —
// this list just exists standalone from ProductRecord the same way
// DiscountProductRecord does, e.g. for a different set of hub-specific
// prices without touching the main Product List.
export type TradeSalesProductRecord = {
  id: string
  name: string
  banglaName?: string
  category?: string
  // Pieces per carton/bag, e.g. "06 ps = 1 bg" — same role as ProductRecord's
  // packSize/RateCardLineItem's perCtnBgs.
  perCtnBgs?: string
  rawRate: number
  manufRate: number
  depotRate: number
  // Depot's selling rate, typed in by hand ("Depot S R" column).
  dealerRate: number
  tpRate: number
  mrpRate: number
  isActive?: boolean
  createdAt: string
  updatedAt: string
}

export type TradeSalesProductInput = {
  name: string
  banglaName?: string
  category?: string
  perCtnBgs?: string
  rawRate?: number
  manufRate?: number
  depotRate?: number
  dealerRate?: number
  tpRate?: number
  mrpRate?: number
  isActive?: boolean
}

// ---- Product Return (Damage/Return against the Trade Sales Product List) --
// Independent of any invoice — a damaged or returned product is often old
// stock (2, 5+ years) that was never billed on a recent Rate Card, so this
// no longer requires (or looks up) a RateCardRecord. Each line is picked
// straight off the Trade Sales Product List (TradeSalesProductRecord) by
// name; qty is entered in whichever unit actually came back (Pcs or Kg),
// used as-is against the rate — no per-carton/bag conversion the way a Rate
// Card line applies (see parsePerCtnMultiplier).
//
// `returnParty` says who physically returned the goods — only Depot or
// Dealer are ever offered, never a third "raw material/manufacturing" stage
// (the invoice side of the app never had one either — the Company → Depot →
// Dealer chain is always just those two hops):
//   'depot'  — goods came back straight to the Company from the Depot. Only
//              the Company<->Depot leg unwinds: companyProfit is pulled
//              down using the Depot Purchase Price ("Depot P R" /
//              depotRate) already on file for that product — never re-typed.
//   'dealer' — goods came back from the Dealer to the Depot, which in turn
//              unwinds its own purchase from the Company, so BOTH legs move:
//              companyProfit as above, plus depotProfit using the Depot
//              Sales Price ("Depot S R" / dealerRate — the dealer's own
//              buying price). This is the "both Depot's and Dealer's return
//              value get calculated automatically" requirement — both rates
//              already live on the Trade Sales Product List, so picking the
//              product and typing the qty is all that's needed.
// See computeProductReturnTotals in provider.tsx for the exact formulas.
//
// Rates are never re-typed on a return — they're copied from the matching
// Trade Sales Product List entry at the moment of return (see
// createProductReturn in provider.tsx) so a return can never silently
// disagree with the price list.
//
// Same sunk-cost write-off as before this chunk: the full manufacturing cost
// of the returned goods is posted as a "Factory Expense" (a total loss once
// they're back) and 10% of the raw material cost is posted as a "Raw
// Material" expense (the other 90% is assumed recoverable/re-usable) — both
// ordinary ExpenseRecords (see createProductReturn in provider.tsx), so they
// flow through the normal approval + ledger + Company Earnings expense
// pipeline just like any manually-recorded expense.
//
// rateCardId/invoiceNo are kept only so a return recorded before this chunk
// (against an actual invoice) still type-checks and prints correctly — a
// new return never sets them.
export type ProductReturnParty = 'depot' | 'dealer'
export type ProductReturnUnit = 'pcs' | 'kg'

export type ProductReturnItem = {
  // Links back to the Trade Sales Product List line this was returned
  // against (TradeSalesProductRecord.id) — kept as `productId` for
  // consistency with RateCardLineItem/reports that key off this field, even
  // though it no longer points at a ProductRecord.
  productId?: string
  productName: string
  qty: number
  unit: ProductReturnUnit
  rawRate: number
  manufRate: number
  depotRate: number // Depot Purchase Price ("Depot P R")
  dealerRate: number // Depot Sales Price ("Depot S R") — the dealer's buying price
  tpRate?: number
  mrpRate?: number
  perCtnBgs?: string
}

export type ProductReturnRecord = {
  id: string
  returnNumber: string
  rateCardId?: string
  invoiceNo?: string
  returnParty: ProductReturnParty
  // The Depot or Dealer this return is against, per `returnParty` — links to
  // DepotRecord/DealerRecord so the printed voucher shows the real party
  // instead of free text. recipientName is that party's name, copied in at
  // save time the same way every other voucher on this app does (falls back
  // to a typed name when neither list has the right entry on file).
  depotId?: string
  dealerId?: string
  recipientName: string
  date: string
  items: ProductReturnItem[]
  reason: string
  rawRateTotal: number
  manufRateTotal: number
  depotRateTotal: number
  dealerRateTotal: number
  tpRateTotal: number
  mrpRateTotal: number
  companyProfit: number // depotRateTotal - manufRateTotal, always computed
  depotProfit: number   // dealerRateTotal - depotRateTotal, only when returnParty === 'dealer'
  dealerProfit: number  // kept at 0 going forward (no "customer return" tier in this flow); retained only so old records/reports keep type-checking
  // Sunk-cost write-off (see ProductReturnItem comment above) — the linked
  // ExpenseRecord ids let deleteProductReturn reverse them along with the
  // return itself; the amounts are snapshotted here so the printed voucher
  // and the returns list never have to re-derive them from `items`.
  manufacturingExpenseId?: string
  manufacturingExpenseAmount: number // = manufRateTotal, posted as Factory Expense
  rawMaterialExpenseId?: string
  rawMaterialExpenseAmount: number // = 10% of rawRateTotal, posted as Raw Material expense
  processedBy: string
  processedByName: string
  createdAt: string
}

export type ProductReturnInput = {
  returnParty: ProductReturnParty
  depotId?: string
  dealerId?: string
  // Fallback label only used when neither depotId nor dealerId is picked.
  recipientName?: string
  date?: string
  // Only productId (a TradeSalesProductRecord id)/productName + qty/unit —
  // rates are always copied from the Trade Sales Product List, never
  // re-entered (see the ProductReturnRecord comment above).
  items: Array<{ productId?: string; productName: string; qty: number; unit: ProductReturnUnit }>
  reason?: string
}

// ---- Purchase Section (procurement from vendors) --------------------------
// The পারচেজ বিভাগ chunk: buying raw material and packaging material from
// vendors, and tracking two things live off that:
//   1) Vendor ledger — daily how much (kg/pcs) was bought from a vendor, at
//      what rate, how much was deposited against it, and the running amount
//      still owed to them (see computeVendorDue in utils.ts — mirrors
//      computeDealerDue's "always derive from the transaction record" shape,
//      never stored on the vendor itself).
//   2) Material stock — raw material (bought/tracked in Kg) and packaging
//      material (Packet/Pouch/Carton/Bottle/Sack/Sticker — bought in Kg or
//      Pcs depending on the item) both live in one PurchaseMaterialRecord
//      list. A purchase (PurchaseRecord) adds to stock; a MaterialUsageRecord
//      (production consuming it, or stock going out to Depot/Dealer) takes
//      it back down — so the Materials & Stock report always shows current
//      stock without anyone re-typing a running total, and flags what needs
//      buying next (stockQty <= minStock).
//
// Deliberately NOT posted to the ledger/Automatic Accounting Engine — same
// simplification as CashMaintenanceRecord's "goods/packaging purchase"
// category (see the comment there): this is a standalone procurement +
// stock log, not a Chart-of-Accounts-integrated module.
export type VendorRecord = {
  id: string
  name: string
  proprietorName?: string
  address: string
  phone: string
  createdAt: string
  updatedAt: string
}

export type VendorInput = {
  name: string
  proprietorName?: string
  address?: string
  phone?: string
}

// 'raw_material' is what gets converted into packaged finished goods (e.g.
// tea leaf, bought and tracked in Kg); 'packaging_material' is what wraps it
// (Packet/Pouch/Carton/Bottle/Sack/Sticker) — bought either by weight (a roll
// of pouch film, tracked in Kg) or by count (a sack/carton, tracked in Pcs).
export type PurchaseMaterialCategory = 'raw_material' | 'packaging_material'
export type PackagingType = 'Packet' | 'Pouch' | 'Carton' | 'Bottle' | 'Sack' | 'Sticker' | 'Other'
export type PurchaseMaterialUnit = 'kg' | 'pcs'

// One material/packaging item on the master list — stockQty is the running
// balance a Purchase (in) and a Material Usage (out) move, never re-typed
// directly except to correct an opening balance.
//
// The spec's conversion example: a 40g tea-leaf pouch made of 3g of pouch
// film — 100kg of pouch film in stock becomes 100,000g / 3g = 33,333 pieces
// (see unitWeightGrams below). A sack bought/tracked by the piece instead
// (20 sacks in stock, each holding 500 finished pieces) shows 20 x 500 =
// 10,000 pieces of packing capacity instead (see capacityPerUnit below).
// Only one of the two is ever set on a given material — whichever matches
// how it's actually bought/tracked (`unit`). See
// computeMaterialAvailablePieces in utils.ts for the derived number the
// Materials & Stock report shows.
export type PurchaseMaterialRecord = {
  id: string
  name: string
  category: PurchaseMaterialCategory
  // Only meaningful when category is 'packaging_material'.
  packagingType?: PackagingType
  unit: PurchaseMaterialUnit
  // Grams of this material used per finished piece — set when `unit` is
  // 'kg' (e.g. pouch film, bottle cap plastic) so a weight-based stock can
  // still be read off as "pieces available".
  unitWeightGrams?: number
  // Finished pieces one unit of this material can pack — set when `unit`
  // is 'pcs' (e.g. a sack/carton bought and counted individually).
  capacityPerUnit?: number
  stockQty: number
  minStock: number
  createdAt: string
  updatedAt: string
}

export type PurchaseMaterialInput = {
  name: string
  category: PurchaseMaterialCategory
  packagingType?: PackagingType
  unit: PurchaseMaterialUnit
  unitWeightGrams?: number
  capacityPerUnit?: number
  stockQty?: number
  minStock?: number
}

// One line of a purchase — qty/rate are always in the material's own unit
// (Kg or Pcs); category/unit are copied from the material at save time (like
// ProductReturnItem copies its rates) so a report never has to re-look the
// material up to know how to read a historical line.
export type PurchaseItem = {
  materialId?: string
  materialName: string
  category: PurchaseMaterialCategory
  unit: PurchaseMaterialUnit
  qty: number
  rate: number
  amount: number
}

// One procurement transaction from a vendor — paid/due follow the same
// pattern as OrderRecord (paid entered at save time, due = totalAmount -
// paid, further paydowns tracked as VendorPaymentRecord the way
// CollectionRecord tracks a dealer paydown against an OrderRecord).
export type PurchaseRecord = {
  id: string
  purchaseNumber: string
  vendorId?: string
  vendorName: string
  date: string
  items: PurchaseItem[]
  totalAmount: number
  paid: number
  due: number
  note?: string
  createdBy: string
  createdByName: string
  createdAt: string
}

export type PurchaseInput = {
  vendorId?: string
  vendorName?: string
  date?: string
  items: Array<{ materialId?: string; materialName: string; qty: number; rate: number }>
  paid?: number
  note?: string
}

// A paydown against one purchase's outstanding due — same role as
// CollectionRecord against an OrderRecord (see recordCollection in
// provider.tsx), just on the payable side instead of the receivable side.
export type VendorPaymentRecord = {
  id: string
  receiptNumber: string
  purchaseId: string
  purchaseNumber: string
  vendorId?: string
  vendorName: string
  amount: number
  date: string
  note?: string
  createdBy: string
  createdByName: string
  createdAt: string
}

export type VendorPaymentInput = {
  purchaseId: string
  amount: number
  date?: string
  note?: string
}

// Stock going back out — production consuming raw/packaging material, or
// stock issued to a Depot/Dealer — the "then it'll be minus'd" half of the
// spec (points 2 and 3). Freeform `note` records why (e.g. "Packed into
// Batch #12", "Issued to Mymensingh Depot") since there's no production/BOM
// module yet for this to link to automatically.
export type MaterialUsageRecord = {
  id: string
  materialId: string
  materialName: string
  category: PurchaseMaterialCategory
  unit: PurchaseMaterialUnit
  qty: number
  date: string
  note?: string
  createdBy: string
  createdByName: string
  createdAt: string
}

export type MaterialUsageInput = {
  materialId: string
  qty: number
  date?: string
  note?: string
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
  // Only meaningful on a সেলারি-category entry (see EXPENSE_SALARY_CATEGORY
  // in standardChartOfAccounts.ts) — lets a specific employee's salary
  // history be pulled back out later (Finance page's Salary History
  // section, backed by computeEmployeeSalaryTotals in utils.ts), since
  // sometimes salary is paid by checking past history/cheques rather than
  // from memory.
  employeeId?: string
  employeeName?: string
  createdBy: string
  createdByName: string
  createdAt: string
}

// ---- Loan Management (Loan Chart) -----------------------------------------
// Money the company borrows from a member/lender (an individual, cooperative
// member, investor, etc.) and repays over time — a LoanAccountRecord is just
// who the loan is with, mirroring DealerRecord's plain name/phone/address
// shape. The running balance owed is never stored on it — always the live
// sum of every LoanTransactionRecord against it (a 'withdrawal' raises the
// balance, a 'repayment' lowers it, "derive, don't store") — see
// computeLoanBalance in utils.ts. Falls to zero once fully repaid.
export type LoanAccountRecord = {
  id: string
  memberName: string
  phone: string
  address?: string
  createdAt: string
  updatedAt: string
}

export type LoanAccountInput = {
  memberName: string
  phone?: string
  address?: string
}

// 'withdrawal' = a new loan draw against the account (raises the balance
// owed); 'repayment' = money paid back against it (lowers the balance).
export type LoanTransactionType = 'withdrawal' | 'repayment'

export type LoanTransactionRecord = {
  id: string
  loanAccountId: string
  memberName: string
  type: LoanTransactionType
  amount: number
  date: string
  note?: string
  createdBy: string
  createdByName: string
  createdAt: string
}

export type LoanTransactionInput = {
  loanAccountId: string
  type: LoanTransactionType
  amount: number
  date?: string
  note?: string
}

// ---- Cash Maintenance Chart -------------------------------------------------
// A separate cash-outflow chart from the এক্সপেন্স/ExpenseRecord bucket above
// — the client's own "ক্যাশ মেইনটেনেন্স" categories (see
// CASH_MAINTENANCE_CATEGORIES in standardChartOfAccounts.ts: loan repayment,
// new market investment, goods/packaging purchase, depot commission, dealer
// payment for product transport), none of which overlap with an Expense
// category — these are cash/balance-sheet movements that never touch
// Company Earnings' net profit the way an Expense does. Recorded entirely
// separately from ExpenseRecord and never posted to the ledger/Automatic
// Accounting Engine — this is a standalone cash log; the Loan & Cash
// Maintenance page's reconciliation check sums it together with
// ExpenseRecord (both are real cash out) and compares that against loan
// withdrawals + sales money for the same period.
// `isDirectExpense` marks an entry recorded under the DIRECT_EXPENSE_CATEGORY
// option — shown on the chart for the record but excluded from that cash-out
// total, since it's only there to help the books balance, not a real spend.
export type CashMaintenanceRecord = {
  id: string
  category: string
  amount: number
  date: string
  note?: string
  isDirectExpense?: boolean
  createdBy: string
  createdByName: string
  createdAt: string
}

export type CashMaintenanceInput = {
  category: string
  amount: number
  date?: string
  note?: string
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
// meant to be the live sum of net sales for the matching orders in that
// period, so it can never drift from the books.
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
  dealerCategories: Record<string, DealerCategoryRecord>
  depots: Record<string, DepotRecord>
  products: Record<string, ProductRecord>
  discountProducts: Record<string, DiscountProductRecord>
  tradeSalesProducts: Record<string, TradeSalesProductRecord>
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
  productReturns: Record<string, ProductReturnRecord>
  vendors: Record<string, VendorRecord>
  purchaseMaterials: Record<string, PurchaseMaterialRecord>
  purchases: Record<string, PurchaseRecord>
  vendorPayments: Record<string, VendorPaymentRecord>
  materialUsages: Record<string, MaterialUsageRecord>
  qualityChecks: Record<string, QualityCheckRecord>
  qcHolds: Record<string, QcHoldRecord>
  notifications: Record<string, NotificationRecord>
  activities: Record<string, ActivityRecord>
  loginHistory: Record<string, LoginHistoryRecord>
  expenses: Record<string, ExpenseRecord>
  loanAccounts: Record<string, LoanAccountRecord>
  loanTransactions: Record<string, LoanTransactionRecord>
  cashMaintenance: Record<string, CashMaintenanceRecord>
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
  packSize: string
  weight?: number
  purchasePrice: number
  sellingPrice: number
  wholesalePrice?: number
  mrp?: number
  dealerPrice?: number
  distributorPrice?: number
  minSellingPrice?: number
  rawRate?: number
  manufRate?: number
  depotRate?: number
  dealerRate?: number
  tpRate?: number
  mrpRate?: number
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
  proprietorName?: string
  address?: string
  phone: string
  categoryId?: string
  depotId?: string
}

export type DealerCategoryInput = {
  name: string
}

export type DepotInput = {
  name: string
  proprietorName?: string
  address?: string
  phone?: string
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
  // Only kept when category is EXPENSE_SALARY_CATEGORY — see
  // ExpenseRecord.employeeId.
  employeeId?: string
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
