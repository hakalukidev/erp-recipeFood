// Single source of truth for the company letterhead printed on any
// generated invoice/voucher/challan. Any future invoice-generating
// screen should import these instead of hardcoding its own copy — see
// buildRateCardHtml / buildDealerInvoiceHtml / buildDepotInvoiceHtml in
// app/admin/rate-card/page.tsx for the expected usage pattern.
export const COMPANY_NAME = 'Recipe Food Products Limited'
export const COMPANY_ADDRESS = 'রোড নং- ১০/এ, হাউজ নাম্বার- ৫৪০, গ্রেটওয়াল সিটি, চন্দনা চৌরাস্তা, গাজিপুর, ঢাকা'
export const COMPANY_EMAIL = 'recipeinfo2020@gmail.com'
export const COMPANY_HELPLINE = '01350462274'
// Printed at the bottom of every generated invoice/voucher/challan.
export const COMPANY_INVOICE_FOOTER_NOTE = 'This is Computer Generated Invoice no need any seal & signature.'

// The company started running its books on this ERP in September 2026, so
// every opening balance (Daily Cash Book, Fund/Cash Flow report) starts at
// zero on this date — anything dated earlier (test entries, backdated
// records) is never carried forward into an opening balance.
export const BOOKS_START_DATE = '2026-09-01'
