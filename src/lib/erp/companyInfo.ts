// Single source of truth for the company letterhead printed on any
// generated invoice/voucher/challan. Matches the client's paper invoices
// (Moyner Mor / Mymensingh Sadar office). Any future invoice-generating
// screen should import these instead of hardcoding its own copy — see
// buildRateCardHtml / buildDealerInvoiceHtml / buildDepotInvoiceHtml in
// app/admin/rate-card/page.tsx for the expected usage pattern.
export const COMPANY_NAME = 'Recipe Food Products Limited'
export const COMPANY_ADDRESS = 'Moyner Mor, Mymensingh Sadar, Mymensingh'
export const COMPANY_EMAIL = 'recipeinfo2020@gmail.com'
export const COMPANY_HELPLINE = '+8801790787093'
