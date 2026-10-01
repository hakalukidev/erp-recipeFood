import type { AccountType, LedgerAccount } from '@/lib/erp/types'

// Section 28's exact hierarchy — the button on the Accounting page seeds
// these once (idempotent by `code`, like the Section 1 starter catalog
// loader). Rows with a `ledgerAccount` are "system" accounts the
// Automatic Accounting Engine (Section 29) already posts to on its own;
// the rest exist purely so a manual Journal Entry (Section 27) has
// somewhere to post.
export const STANDARD_CHART_OF_ACCOUNTS: Array<{
  code: string
  name: string
  type: AccountType
  ledgerAccount?: LedgerAccount
}> = [
  // Assets
  { code: '1001', name: 'Cash', type: 'asset', ledgerAccount: 'cash' },
  { code: '1002', name: 'Bank', type: 'asset', ledgerAccount: 'bank' },
  { code: '1002a', name: 'MFS (Mobile Banking)', type: 'asset', ledgerAccount: 'mfs' },
  { code: '1003', name: 'Accounts Receivable', type: 'asset', ledgerAccount: 'dealer' },
  { code: '1004', name: 'Inventory', type: 'asset', ledgerAccount: 'inventory' },
  { code: '1005', name: 'Raw Material', type: 'asset' },
  { code: '1006', name: 'Finished Goods', type: 'asset' },
  { code: '1007', name: 'Work in Process', type: 'asset', ledgerAccount: 'wip' },
  { code: '1008', name: 'Fixed Assets', type: 'asset' },
  { code: '1009', name: 'Advance', type: 'asset' },
  // Liabilities
  { code: '2001', name: 'Supplier Payable', type: 'liability', ledgerAccount: 'accounts_payable' },
  { code: '2002', name: 'Bank Loan', type: 'liability' },
  { code: '2003', name: 'Other Payable', type: 'liability' },
  { code: '2004', name: 'Tax/VAT Payable', type: 'liability', ledgerAccount: 'vat_payable' },
  // Equity
  { code: '3001', name: 'Share Capital', type: 'equity' },
  { code: '3002', name: 'Retained Earnings', type: 'equity' },
  // Revenue
  { code: '4001', name: 'Product Sales', type: 'revenue', ledgerAccount: 'sales' },
  { code: '4002', name: 'Sales Return', type: 'revenue', ledgerAccount: 'sales_return' },
  { code: '4003', name: 'Other Income', type: 'revenue' },
  // Expenses
  { code: '5001', name: 'Cost of Goods Sold (COGS)', type: 'expense', ledgerAccount: 'cogs' },
  { code: '5002', name: 'Salary', type: 'expense', ledgerAccount: 'salary' },
  { code: '5003', name: 'Rent', type: 'expense', ledgerAccount: 'rent' },
  { code: '5004', name: 'Electricity', type: 'expense', ledgerAccount: 'electricity' },
  { code: '5005', name: 'Transport', type: 'expense', ledgerAccount: 'transport' },
  { code: '5006', name: 'Marketing', type: 'expense', ledgerAccount: 'marketing' },
  { code: '5007', name: 'Commission', type: 'expense', ledgerAccount: 'commission' },
  { code: '5008', name: 'Office Expense', type: 'expense', ledgerAccount: 'office_expense' },
  { code: '5009', name: 'Factory Expense', type: 'expense', ledgerAccount: 'factory_expense' },
  { code: '5010', name: 'Bank Charge', type: 'expense', ledgerAccount: 'bank_charge' },
  { code: '5011', name: 'Depreciation', type: 'expense', ledgerAccount: 'depreciation' },
  { code: '5012', name: 'Other Expense / Miscellaneous', type: 'expense', ledgerAccount: 'other_expense' },
  { code: '5013', name: 'Fuel', type: 'expense', ledgerAccount: 'fuel' },
  { code: '5014', name: 'Advertisement', type: 'expense', ledgerAccount: 'advertisement' },
  { code: '5015', name: 'Repair', type: 'expense', ledgerAccount: 'repair' },
  { code: '5016', name: 'Utility', type: 'expense', ledgerAccount: 'utility' },
  { code: '5017', name: 'Travel', type: 'expense', ledgerAccount: 'travel' },
  { code: '5018', name: 'Loan Repayment (Operational)', type: 'expense', ledgerAccount: 'loan_repayment' },
]

// The Expense Category list — the Finance page's "Record expense" form uses
// this as its category dropdown. Replaced with the client's own Expense head
// chart (the "এক্সপেন্স" bucket, as distinct from the "ক্যাশ মেইন্টেনেন্স"
// bucket below — CASH_MAINTENANCE_CATEGORIES — which are cash outflows, not
// P&L expenses, and are recorded on the Loan & Cash Maintenance admin page
// instead): only these heads actually reduce Company Earnings' net profit
// (see buildCompanyEarningsSummary in utils.ts).
//
// 2026-09-29 client spec §19: 'ড্যামেজ' (Damage) removed — a dealer's damaged
// product is not an expense; it goes through Product Return, which credits
// the dealer's invoice due (Damaged Product → Product Return → Dealer
// Account Adjustment). Old Damage expenses stay on file and keep their
// ledger mapping below; they just can't be newly entered.
//
// These are the stable category keys stored on ExpenseRecord.category and
// matched by logic (EXPENSE_SALARY_CATEGORY etc.). The name shown to users
// can be renamed from the Finance page (spec §18) — see
// SettingsRecord.expenseCategoryLabels and expenseCategoryLabel in utils.ts.
export const EXPENSE_CATEGORIES = [
  'ডিলার কমিশন ও মার্কেট ছাড়',
  'এসআর ইনসেন্টিভ',
  'পরিবহন খরচ',
  'ব্যাংক বা বিকাশ খরচ',
  'অনান্য/বিবিধ খরচ',
  'রেন্ট',
  'বিদ্যুৎ বিল',
  'সেলারি',
  // 2026-09-15 client request: packaging material purchases (প্যাকেট/পাউচ)
  // are never a P&L expense — moved out of this list entirely so the Finance
  // page's "Record expense" form can no longer post one here. Use the Cash
  // Maintenance chart's 'প্যাকেজিং মেটেরিয়ালস ক্রয়' below instead — entered
  // directly there (a Purchase no longer posts to it automatically).
  // 2026-09-12 client request: a loan repayment recorded here (as opposed to
  // the same-named category on the Cash Maintenance chart below) is treated
  // as a direct operational expense — it hits Company Earnings' net profit
  // like any other Expense head, and auto-posts a matching
  // LoanTransactionRecord so it also shows on the Loan & Investment ledger
  // (see saveExpense in provider.tsx). Use the Cash Maintenance chart
  // instead for a repayment that should stay a pure balance-sheet cash
  // movement, not a P&L deduction.
  'ঋণ পরিশোধ',
] as const

// Free-text expense categories (Finance page) are matched against this map
// (case-insensitive, meaningless for Bangla text but kept for shape) to
// decide which Chart of Accounts expense head an expense auto-posts
// against; anything unmatched falls back to 'other_expense'. Kept in sync
// with the Expenses group above.
export const EXPENSE_CATEGORY_LEDGER_ACCOUNT: Record<string, LedgerAccount> = {
  // Legacy only — no longer an EXPENSE_CATEGORIES entry (see above).
  'ড্যামেজ': 'other_expense',
  'ডিলার কমিশন ও মার্কেট ছাড়': 'commission',
  'এসআর ইনসেন্টিভ': 'commission',
  'পরিবহন খরচ': 'transport',
  'ব্যাংক বা বিকাশ খরচ': 'bank_charge',
  'অনান্য/বিবিধ খরচ': 'other_expense',
  'রেন্ট': 'rent',
  'বিদ্যুৎ বিল': 'electricity',
  'সেলারি': 'salary',
  'ঋণ পরিশোধ': 'loan_repayment',
}

// ---- Cash Maintenance Chart -----------------------------------------------
// The Loan & Cash Maintenance page's "Record cash entry" category dropdown —
// the client's own exact "ক্যাশ মেইনটেনেন্স" list: cash movements that never
// touch Company Earnings' P&L (new market investment, goods/packaging
// purchase, depot commission, dealer payment for product transport) — kept
// deliberately separate from EXPENSE_CATEGORIES above (Rent, Salary,
// Transport, etc.; see CashMaintenanceRecord in types.ts for why the two
// charts are kept separate, and the Loan & Cash Maintenance page's
// reconciliation check for where they're summed back together as one "total
// cash out" figure). 'ঋণ পরিশোধ' deliberately appears on BOTH charts as of
// the 2026-09-12 client request — this list's entry stays a pure cash
// movement, while the same-named EXPENSE_CATEGORIES entry (see
// EXPENSE_LOAN_REPAYMENT_CATEGORY) is the one that hits net profit and
// auto-posts to the Loan & Investment ledger; which one to use is the
// operator's call per repayment.
export const CASH_MAINTENANCE_CATEGORIES = [
  'ঋণ পরিশোধ',
  'নতুন মার্কেট ইনভেস্টমেন্ট',
  'পণ্য ক্রয়',
  'প্যাকেজিং মেটেরিয়ালস ক্রয়',
  'ডিপো কমিশন',
  // 2026-09-22 client request: a depot cash movement that must not hit net
  // profit, so it's entered directly here rather than on the Expense chart.
  // Renamed from 'ডিপো ভাড়া' on 2026-10-02 (client request) — see
  // LEGACY_CASH_CATEGORY_RENAMES for how older entries are mapped.
  'ডিপো পণ্য পরিবহন',
  'ডিলার পেমেন্ট পণ্য পরিবহন',
  // 2026-09-15 client request: petty cash handed out day-to-day (e.g. the
  // factory mess/office's small market-money advances to staff) — the real
  // expense only lands once it's settled against that employee's salary
  // (a সেলারি-category Expense then), so counting it here too would be a
  // second, premature P&L hit for money that hasn't actually been spent by
  // the company yet. Stays a pure cash movement like the rest of this list.
  'অফিস খরচ',
] as const

// The three categories the client enters most often on the Cash Maintenance
// chart (2026-09-22 client request) — shown as one-tap buttons above the
// category dropdown in the Record cash entry dialog. `পণ্য ক্রয়` is also the
// dialog's default category.
export const CASH_QUICK_CATEGORIES = [
  { label: 'পণ্য ক্রয়', category: 'পণ্য ক্রয়' },
  { label: 'পাউচ / প্যাকেট', category: 'প্যাকেজিং মেটেরিয়ালস ক্রয়' },
  { label: 'ডিপো পণ্য পরিবহন', category: 'ডিপো পণ্য পরিবহন' },
] as const

// Cash Maintenance categories that were renamed after entries had already
// been saved under the old name — mapped to the new name on load so old and
// new entries group together in every report.
export const LEGACY_CASH_CATEGORY_RENAMES: Record<string, string> = {
  'ডিপো ভাড়া': 'ডিপো পণ্য পরিবহন',
}
export const CASH_DEFAULT_OUT_CATEGORY = CASH_QUICK_CATEGORIES[0].category

// Cash Maintenance entries recorded with direction 'in' (2026-09-22 client
// request) — money received into the till that isn't already tracked as a
// sale collection or loan withdrawal, e.g. the "ডিলার পয়েন্ট হতে টাকা রিসিভ"
// and "গাজীপুর থেকে কালেকশন" lines of the daily cash sheet. Kept off
// CASH_MAINTENANCE_CATEGORIES so the cash-out dropdown stays outflow-only.
export const CASH_IN_CATEGORIES = [
  'ডিলার পয়েন্ট হতে টাকা রিসিভ',
  'গাজীপুর থেকে কালেকশন',
  'অন্যান্য ক্যাশ জমা',
] as const

// Named so provider.tsx's saveLoanTransaction (2026-09-14 client request — a
// repayment recorded directly on the Loan Chart now hits cash flow too,
// instead of only ever moving the member's balance) can post to this
// category without hardcoding the Bangla literal a second time.
export const CASH_CATEGORY_LOAN_REPAYMENT = 'ঋণ পরিশোধ'

// Named so provider.tsx's saveInvestor (2026-09-12 client request — a new
// investment now hits cash flow) can post to this category without
// hardcoding the Bangla literal a second time.
export const CASH_CATEGORY_NEW_MARKET_INVESTMENT = 'নতুন মার্কেট ইনভেস্টমেন্ট'

// Direct expense entered on the Cash Maintenance chart — counts as cash out
// everywhere and as a P&L expense (see CashMaintenanceRecord.isDirectExpense).
// Was excluded from all totals until 2026-09-29 (client spec §20–21).
export const DIRECT_EXPENSE_CATEGORY = 'সরাসরি এক্সপেন্স (হিসাব মেলানোর জন্য)'

// Damage (ড্যামেজ) on the Cash Maintenance chart (2026-10-02 client request)
// — cash paid out for damaged goods. Unlike the rest of
// CASH_MAINTENANCE_CATEGORIES it is a real loss, so it is treated like
// DIRECT_EXPENSE_CATEGORY: cash out everywhere AND a P&L expense in Company
// Earnings / Fund-Cash Flow (isDirectExpense). It can optionally be linked
// to the Product Return it settles (CashMaintenanceRecord.productReturnId),
// which then shows the cash damage on the Product Returns list. Same Bangla
// name as the retired Expense category, so old Damage expenses and new
// Damage cash entries group together in the by-category totals.
export const CASH_CATEGORY_DAMAGE = 'ড্যামেজ'

// Advance Salary (অ্যাডভান্স সেলারি) on the Cash Out side (2026-10-02 client
// request) — salary handed to an employee ahead of payday, tagged with the
// employee's name (CashMaintenanceRecord.employeeName). Counted as cash out
// and as a P&L salary cost the day it's paid, so when that month's salary
// is recorded on the Finance page only the remaining cash goes in `amount`
// and the deducted part goes in ExpenseRecord.advanceAdjusted — nothing is
// counted twice. Outstanding per employee = advances − adjusted
// (computeEmployeeAdvances in utils.ts).
export const CASH_CATEGORY_ADVANCE_SALARY = 'অ্যাডভান্স সেলারি'

// Cash-out categories that also count as a P&L expense.
export const CASH_PNL_EXPENSE_CATEGORIES: readonly string[] = [
  DIRECT_EXPENSE_CATEGORY,
  CASH_CATEGORY_DAMAGE,
  CASH_CATEGORY_ADVANCE_SALARY,
]

// The EXPENSE_CATEGORIES entry an expense must carry to be eligible for the
// per-employee tag (ExpenseRecord.employeeId) that powers the Salary History
// section of the Finance page.
export const EXPENSE_SALARY_CATEGORY = 'সেলারি'

// The EXPENSE_CATEGORIES entry an expense must carry to be eligible for the
// loan-account tag (ExpenseRecord.loanAccountId) that auto-posts a matching
// LoanTransactionRecord — see the comment on EXPENSE_CATEGORIES above.
export const EXPENSE_LOAN_REPAYMENT_CATEGORY = 'ঋণ পরিশোধ'
