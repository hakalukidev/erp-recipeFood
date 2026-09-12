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
export const EXPENSE_CATEGORIES = [
  'ড্যামেজ',
  'ডিলার কমিশন ও মার্কেট ছাড়',
  'এসআর ইনসেন্টিভ',
  'পরিবহন খরচ',
  'ব্যাংক বা বিকাশ খরচ',
  'অনান্য/বিবিধ খরচ',
  'রেন্ট',
  'বিদ্যুৎ বিল',
  'সেলারি',
  'প্যাকেজিং মেটেরিয়ালস (প্যাকেট/ পাউচ)',
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
  'ড্যামেজ': 'other_expense',
  'ডিলার কমিশন ও মার্কেট ছাড়': 'commission',
  'এসআর ইনসেন্টিভ': 'commission',
  'পরিবহন খরচ': 'transport',
  'ব্যাংক বা বিকাশ খরচ': 'bank_charge',
  'অনান্য/বিবিধ খরচ': 'other_expense',
  'রেন্ট': 'rent',
  'বিদ্যুৎ বিল': 'electricity',
  'সেলারি': 'salary',
  'প্যাকেজিং মেটেরিয়ালস (প্যাকেট/ পাউচ)': 'factory_expense',
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
  'ডিলার পেমেন্ট পণ্য পরিবহন',
] as const

// Named so provider.tsx's buildPurchaseCashEntries (2026-09-12 client
// request — a Purchase's paid amount/vendor paydown now hits cash flow) can
// post to these two without hardcoding the Bangla literal a second time.
export const CASH_CATEGORY_GOODS_PURCHASE = 'পণ্য ক্রয়'
export const CASH_CATEGORY_PACKAGING_PURCHASE = 'প্যাকেজিং মেটেরিয়ালস ক্রয়'

// Named so provider.tsx's saveInvestor (2026-09-12 client request — a new
// investment now hits cash flow) can post to this category without
// hardcoding the Bangla literal a second time.
export const CASH_CATEGORY_NEW_MARKET_INVESTMENT = 'নতুন মার্কেট ইনভেস্টমেন্ট'

// The one category that's recorded on the Cash Maintenance chart purely to
// help the books balance — never subtracted in the cash-out total the
// reconciliation check uses (see CashMaintenanceRecord.isDirectExpense).
export const DIRECT_EXPENSE_CATEGORY = 'সরাসরি এক্সপেন্স (হিসাব মেলানোর জন্য)'

// The EXPENSE_CATEGORIES entry an expense must carry to be eligible for the
// per-employee tag (ExpenseRecord.employeeId) that powers the Salary History
// section of the Finance page.
export const EXPENSE_SALARY_CATEGORY = 'সেলারি'

// The EXPENSE_CATEGORIES entry an expense must carry to be eligible for the
// loan-account tag (ExpenseRecord.loanAccountId) that auto-posts a matching
// LoanTransactionRecord — see the comment on EXPENSE_CATEGORIES above.
export const EXPENSE_LOAN_REPAYMENT_CATEGORY = 'ঋণ পরিশোধ'
