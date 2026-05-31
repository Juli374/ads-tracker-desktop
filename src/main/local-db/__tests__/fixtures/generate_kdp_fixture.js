/**
 * Generator for the synthetic KDP Royalty fixture used in parser-parity tests.
 *
 * Produces a 4-sheet .xlsx matching exactly what the canonical backend parser
 * (ads-tracker/backend/services/royalty_import_service.py) expects:
 *   - "eBook Royalty"      (16 cols, royalty_date filtering)
 *   - "Paperback Royalty"  (17 cols, dual-date: order_date -> sales, royalty_date -> royalties)
 *   - "Hardcover Royalty"  (17 cols, dual-date)
 *   - "KENP Read"          (6 cols, read_date filtering)
 *
 * Column positions match the spec/backend index-for-index. Header text is
 * cosmetic for the backend (it reads by position, min_row=2), but we use
 * realistic KDP header labels.
 *
 * Target month for the canonical reference: 2026-04 (year=2026, month=4).
 * Rows deliberately exercise:
 *   - MARKETPLACE_MAP conversions (Amazon.com->USA, Amazon.co.uk->UK, etc.)
 *   - an unmapped marketplace (passed through verbatim)
 *   - refunds (transaction_type=Refund, units_refunded>0)
 *   - zero / empty / "N/A" / "-" values (numeric + string parsing)
 *   - comma-decimal numbers (European formatting)
 *   - dual-date edge cases: order_date in month but royalty_date out (and vice versa)
 *   - rows fully outside the target month (must be dropped)
 *   - an empty row (row[0] falsy -> skipped)
 *   - KENP reads incl. zero and out-of-month
 *
 * Run: node generate_kdp_fixture.js   (cwd-independent; writes next to itself)
 */
const path = require('path');
const XLSX = require('xlsx');

const OUT = path.join(__dirname, 'kdp_royalty_sample.xlsx');

// ---- eBook Royalty -------------------------------------------------------
// cols: royalty_date, title, author, asin, marketplace, royalty_type,
//       transaction_type, units_sold, units_refunded, net_units_sold,
//       avg_list_price, avg_offer_price, avg_file_size_mb, avg_delivery_cost,
//       royalty, currency
const ebook = [
  ['Royalty Date', 'Title', 'Author Name', 'ASIN', 'Marketplace', 'Royalty Type',
   'Transaction Type', 'Units Sold', 'Units Refunded', 'Net Units Sold',
   'Avg. List Price', 'Avg. Offer Price', 'Avg. File Size (MB)', 'Avg. Delivery Cost',
   'Royalty', 'Currency'],
  // In-month standard US sale
  ['2026-04-03', 'My KDP Book', 'A. Author', 'B0EBOOK001', 'Amazon.com', '70%',
   'Standard', 5, 0, 5, 9.99, 9.99, 2.5, 0.06, 34.5, 'USD'],
  // In-month UK sale with comma-decimal pricing
  ['2026-04-10', 'My KDP Book', 'A. Author', 'B0EBOOK001', 'Amazon.co.uk', '70%',
   'Standard', 3, 0, 3, '6,99', '6,99', '1,8', '0,04', '14,1', 'GBP'],
  // In-month DE refund (negative-ish: units_refunded, net 0)
  ['2026-04-15', 'Mein Buch', 'B. Autor', 'B0EBOOK002', 'Amazon.de', '70%',
   'Refund', 0, 2, -2, 4.99, 4.99, 1.2, 0.03, -7.0, 'EUR'],
  // In-month with N/A and '-' values
  ['2026-04-20', 'Edge Book', 'C. Writer', 'B0EBOOK003', 'Amazon.ca', '35%',
   'Standard', 1, 0, 1, 'N/A', '-', 'N/A', '-', 1.25, 'CAD'],
  // Unmapped marketplace (passed through verbatim by convert_marketplace)
  ['2026-04-22', 'My KDP Book', 'A. Author', 'B0EBOOK001', 'Amazon.zz', '70%',
   'Standard', 2, 0, 2, 9.99, 9.99, 2.5, 0.06, 13.8, 'USD'],
  // Out-of-month row (March) -> must be dropped
  ['2026-03-28', 'My KDP Book', 'A. Author', 'B0EBOOK001', 'Amazon.com', '70%',
   'Standard', 9, 0, 9, 9.99, 9.99, 2.5, 0.06, 62.1, 'USD'],
  // Empty row -> skipped (row[0] falsy)
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
];

// ---- Paperback Royalty ---------------------------------------------------
// cols: royalty_date, order_date, title, author, isbn, marketplace, royalty_type,
//       transaction_type, units_sold, units_refunded, net_units_sold,
//       avg_list_price, avg_offer_price, avg_manufacturing_cost, royalty, currency, asin
const paperback = [
  ['Royalty Date', 'Order Date', 'Title', 'Author Name', 'ISBN', 'Marketplace',
   'Royalty Type', 'Transaction Type', 'Units Sold', 'Units Refunded', 'Net Units Sold',
   'Avg. List Price', 'Avg. Offer Price', 'Avg. Manufacturing Cost', 'Royalty',
   'Currency', 'ASIN'],
  // Both dates in month -> appears in BOTH sales and royalties
  ['2026-04-05', '2026-04-04', 'My KDP Book', 'A. Author', '9781234567897', 'Amazon.com',
   'Standard', 'Standard', 4, 0, 4, 14.99, 14.99, 3.6, 22.4, 'USD', 'B0PBACK001'],
  // Order in month, royalty in May -> sales only
  ['2026-05-02', '2026-04-28', 'My KDP Book', 'A. Author', '9781234567897', 'Amazon.co.uk',
   'Standard', 'Standard', 2, 0, 2, 11.99, 11.99, 2.9, 9.0, 'GBP', 'B0PBACK001'],
  // Royalty in month, order in March -> royalties only
  ['2026-04-12', '2026-03-30', 'My KDP Book', 'A. Author', '9781234567897', 'Amazon.de',
   'Standard', 'Standard', 1, 0, 1, '12,99', '12,99', '3,10', '4,80', 'EUR', 'B0PBACK001'],
  // Refund: both dates in month
  ['2026-04-18', '2026-04-17', 'Other Title', 'D. Maker', '9789999999999', 'Amazon.com',
   'Standard', 'Refund', 0, 1, -1, 14.99, 14.99, 3.6, -5.6, 'USD', 'B0PBACK002'],
  // Neither date in month -> dropped from both
  ['2026-02-10', '2026-02-09', 'My KDP Book', 'A. Author', '9781234567897', 'Amazon.com',
   'Standard', 'Standard', 7, 0, 7, 14.99, 14.99, 3.6, 39.2, 'USD', 'B0PBACK001'],
  // Empty row -> skipped
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
];

// ---- Hardcover Royalty (same shape as paperback) -------------------------
const hardcover = [
  ['Royalty Date', 'Order Date', 'Title', 'Author Name', 'ISBN', 'Marketplace',
   'Royalty Type', 'Transaction Type', 'Units Sold', 'Units Refunded', 'Net Units Sold',
   'Avg. List Price', 'Avg. Offer Price', 'Avg. Manufacturing Cost', 'Royalty',
   'Currency', 'ASIN'],
  // Both dates in month
  ['2026-04-08', '2026-04-07', 'My KDP Book', 'A. Author', '9781111111119', 'Amazon.com',
   'Standard', 'Standard', 3, 0, 3, 24.99, 24.99, 6.2, 31.5, 'USD', 'B0HARD0001'],
  // Order in month, royalty out -> sales only
  ['2026-05-09', '2026-04-29', 'My KDP Book', 'A. Author', '9781111111119', 'Amazon.it',
   'Standard', 'Standard', 1, 0, 1, '22,99', '22,99', '5,80', '9,90', 'EUR', 'B0HARD0001'],
  // Royalty in month, order out -> royalties only, with N/A manufacturing cost
  ['2026-04-25', '2026-03-15', 'My KDP Book', 'A. Author', '9781111111119', 'Amazon.co.jp',
   'Standard', 'Standard', 2, 0, 2, 'N/A', 'N/A', 'N/A', 1800, 'JPY', 'B0HARD0001'],
  // Empty row -> skipped
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
];

// ---- KENP Read -----------------------------------------------------------
// cols: read_date, title, author, asin, marketplace, kenp_read
const kenp = [
  ['Date', 'Title', 'Author Name', 'ASIN', 'Marketplace', 'KENP Read'],
  ['2026-04-02', 'My KDP Book', 'A. Author', 'B0EBOOK001', 'Amazon.com', 1234],
  ['2026-04-11', 'My KDP Book', 'A. Author', 'B0EBOOK001', 'Amazon.co.uk', 567],
  // Zero read in month -> still kept (row[0] truthy)
  ['2026-04-19', 'Mein Buch', 'B. Autor', 'B0EBOOK002', 'Amazon.de', 0],
  // Out-of-month -> dropped
  ['2026-03-31', 'My KDP Book', 'A. Author', 'B0EBOOK001', 'Amazon.com', 9999],
  // Empty row -> skipped
  ['', '', '', '', '', ''],
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ebook), 'eBook Royalty');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(paperback), 'Paperback Royalty');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hardcover), 'Hardcover Royalty');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kenp), 'KENP Read');

XLSX.writeFile(wb, OUT, { bookType: 'xlsx' });
console.log('Wrote', OUT);
