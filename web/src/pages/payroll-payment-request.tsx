import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import {
  AGENCY_ACCOUNT,
  AGENCY_ADDRESS,
  AGENCY_BANK,
  AGENCY_EMAIL,
  AGENCY_LEGAL_NAME,
  AGENCY_PHONE,
  AGENCY_REG,
  buildTaxInvoice,
  payrollPrintFilename,
  type TaxInvoiceSource,
} from "@/lib/tax-invoice";

type PayRunDetail = TaxInvoiceSource & {
  clientName: string;
  employerName?: string;
  periodEnd?: string;
};

export function PayrollPaymentRequestPage({ payRunId }: { payRunId: string }) {
  const [run, setRun] = useState<PayRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<PayRunDetail>(`/api/v1/pay-runs/${payRunId}/payment-request`)
      .then((data) => {
        if (!cancelled) setRun(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load pay run");
      });
    return () => {
      cancelled = true;
    };
  }, [payRunId]);

  const invoice = useMemo(() => (run ? buildTaxInvoice(run, formatDate) : null), [run]);

  useEffect(() => {
    if (!invoice || !run) return;
    document.title = payrollPrintFilename({
      clientName: invoice.billToName,
      docType: "Tax Invoice",
      docNumber: invoice.invoiceNo,
      periodStart: run.periodStart,
    });
  }, [invoice, run]);

  useEffect(() => {
    document.documentElement.classList.add("tax-invoice-print-root");
    document.body.classList.add("tax-invoice-print-root");
    return () => {
      document.documentElement.classList.remove("tax-invoice-print-root");
      document.body.classList.remove("tax-invoice-print-root");
    };
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" className="mt-4" asChild>
          <a href="/payroll">Back to payroll</a>
        </Button>
      </div>
    );
  }

  if (!run || !invoice) {
    return <div className="p-6 text-sm text-muted-foreground">Loading invoice…</div>;
  }

  return (
    <div className="tax-invoice-page">
      <div className="tax-invoice-toolbar">
        <div className="tax-invoice-toolbar-copy">
          <p className="tax-invoice-toolbar-title">Client payment request · {invoice.invoiceNo}</p>
          <p className="tax-invoice-toolbar-sub">{invoice.billToName}</p>
        </div>
        <div className="tax-invoice-toolbar-actions">
          <Button type="button" variant="outline" asChild>
            <a href="/payroll">
              <ArrowLeftIcon />
              Back to payroll
            </a>
          </Button>
          <Button type="button" onClick={() => window.print()}>
            <PrinterIcon />
            Print / Save PDF
          </Button>
        </div>
      </div>

      <div className="tax-invoice-stage">
        <article className="tax-invoice-sheet">
          <header className="tax-invoice-top">
            <div>
              <div className="tax-invoice-title-row">
                <h1>TAX INVOICE</h1>
                {invoice.draft ? <span className="tax-invoice-badge">Draft</span> : null}
              </div>
              <p className="tax-invoice-meta">Invoice# {invoice.invoiceNo}</p>
              <div className="tax-invoice-balance-label">Balance Due</div>
              <div className="tax-invoice-balance-value">
                {invoice.currency} {formatAmount(invoice.grand)}
              </div>
            </div>
            <div className="tax-invoice-agency">
              <div className="tax-invoice-logo">
                <span className="tax-invoice-mark">LEO</span>
                <span>LEO EMPLOYMENT SERVICES</span>
              </div>
              <div className="tax-invoice-agency-name">{AGENCY_LEGAL_NAME}</div>
              <div>{AGENCY_REG}</div>
              <div>{AGENCY_EMAIL}</div>
              <div>{AGENCY_PHONE}</div>
              <div>{AGENCY_ADDRESS}</div>
            </div>
          </header>

          <section className="tax-invoice-parties">
            <div>
              <div className="tax-invoice-label">Invoice Date</div>
              <div className="tax-invoice-value">{invoice.invoiceDate}</div>
              <div className="tax-invoice-label">Terms</div>
              <div className="tax-invoice-value">Custom</div>
              <div className="tax-invoice-label">Due Date</div>
              <div className="tax-invoice-value">{invoice.dueDate}</div>
            </div>
            <div>
              <div className="tax-invoice-label">Bill To</div>
              <div className="tax-invoice-bill-name">{invoice.billToName}</div>
              {invoice.billToAddress ? <div>{invoice.billToAddress}</div> : null}
              {invoice.billToTin ? <div>TIN: {invoice.billToTin}</div> : null}
            </div>
          </section>

          <table className="tax-invoice-table">
            <thead>
              <tr>
                <th className="col-idx">#</th>
                <th>Item &amp; Description</th>
                <th className="num col-qty">Qty</th>
                <th className="num col-rate">Rate</th>
                <th className="num col-amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.index}>
                  <td className="col-idx">{line.index}</td>
                  <td>
                    <div className="item-title">{line.title}</div>
                    <div className="item-sub">{line.subtitle}</div>
                  </td>
                  <td className="num">{formatAmount(line.qty)}</td>
                  <td className="num">{formatAmount(line.rate)}</td>
                  <td className="num">{formatAmount(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tax-invoice-items-total">Items in Total {formatAmount(invoice.qtyTotal)}</div>

          <section className="tax-invoice-bottom">
            <div className="tax-invoice-notes">
              <div className="notes-label">Notes</div>
              <p>Thank you.</p>
              <p>This invoice is valid without a stamp or signature.</p>
              <p>All payments shall be made in favor of Leo E. Services.</p>
              <div className="tax-invoice-bank">
                <div>Bank: {AGENCY_BANK}</div>
                <div>Account Number: {AGENCY_ACCOUNT}</div>
                <div>Currency: {invoice.currency}</div>
              </div>
            </div>
            <div className="tax-invoice-sums">
              <div className="sum-row muted">
                <span>Sub Total (Tax Exclusive)</span>
                <span>{formatAmount(invoice.subTotal)}</span>
              </div>
              <div className="sum-row muted">
                <span>Total Taxable Amount</span>
                <span>{formatAmount(invoice.subTotal)}</span>
              </div>
              <div className="sum-row muted">
                <span>GST (8%)</span>
                <span>{formatAmount(invoice.gst)}</span>
              </div>
              <div className="sum-row total">
                <span>Total</span>
                <span>
                  {invoice.currency} {formatAmount(invoice.grand)}
                </span>
              </div>
              <div className="tax-invoice-due">
                <span>Balance Due</span>
                <span>
                  {invoice.currency} {formatAmount(invoice.grand)}
                </span>
              </div>
            </div>
          </section>
        </article>
      </div>

      <style>{`
        .tax-invoice-page {
          min-height: 100vh;
          background: #e8eaed;
          color: #1a1a1a;
          color-scheme: only light;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .tax-invoice-toolbar {
          position: sticky;
          top: 0;
          z-index: 20;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: rgba(255, 255, 255, 0.96);
          border-bottom: 1px solid #ddd;
          backdrop-filter: blur(8px);
        }

        .tax-invoice-toolbar-title {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .tax-invoice-toolbar-sub {
          margin: 0.15rem 0 0;
          font-size: 0.75rem;
          color: #666;
        }

        .tax-invoice-toolbar-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .tax-invoice-stage {
          padding: 1.5rem 1rem 2.5rem;
        }

        .tax-invoice-sheet {
          box-sizing: border-box;
          width: 210mm;
          max-width: 100%;
          min-height: 297mm;
          margin: 0 auto;
          padding: 12mm 14mm;
          background: #fff;
          color: #1a1a1a;
          font: 9.5pt/1.4 "Segoe UI", Helvetica, Arial, sans-serif;
          border: none;
          border-radius: 0;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
        }

        .tax-invoice-top {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 8mm;
          align-items: start;
          margin-bottom: 5mm;
        }

        .tax-invoice-title-row {
          display: flex;
          align-items: center;
          gap: 3mm;
          margin-bottom: 3mm;
        }

        .tax-invoice-title-row h1 {
          margin: 0;
          font-size: 18pt;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #111;
        }

        .tax-invoice-badge {
          display: inline-block;
          border: 1px solid #888;
          border-radius: 999px;
          padding: 0.5mm 2.5mm;
          font-size: 8pt;
          color: #555;
        }

        .tax-invoice-meta {
          margin: 0 0 1mm;
          font-size: 9.5pt;
        }

        .tax-invoice-balance-label {
          margin-top: 3mm;
          font-size: 9pt;
          color: #555;
        }

        .tax-invoice-balance-value {
          margin-top: 0.5mm;
          font-size: 16pt;
          font-weight: 700;
        }

        .tax-invoice-agency {
          text-align: right;
          font-size: 9pt;
          color: #333;
        }

        .tax-invoice-logo {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 2mm;
          margin-bottom: 2mm;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .tax-invoice-mark {
          width: 9mm;
          height: 9mm;
          border-radius: 50%;
          background: #0b3d66;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 8pt;
          font-weight: 700;
        }

        .tax-invoice-agency-name {
          font-weight: 700;
          font-size: 10.5pt;
          color: #111;
        }

        .tax-invoice-parties {
          display: grid;
          grid-template-columns: 1fr 1.3fr;
          gap: 8mm;
          margin: 4mm 0 5mm;
          font-size: 9.5pt;
        }

        .tax-invoice-label {
          color: #666;
          font-size: 8.5pt;
          margin-bottom: 0.8mm;
        }

        .tax-invoice-value {
          margin-bottom: 2mm;
        }

        .tax-invoice-bill-name {
          font-weight: 700;
        }

        .tax-invoice-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .tax-invoice-table thead th {
          background: #163a5f;
          color: #fff;
          text-align: left;
          font-size: 8.5pt;
          font-weight: 600;
          padding: 2.2mm 2mm;
          border: none;
        }

        .tax-invoice-table thead th.num {
          text-align: right;
        }

        .tax-invoice-table tbody td {
          border: none;
          border-bottom: 0.4pt solid #ddd;
          padding: 2.2mm 2mm;
          vertical-align: top;
          font-size: 9.5pt;
          background: #fff;
          color: #1a1a1a;
        }

        .tax-invoice-table .col-idx {
          width: 8mm;
          color: #555;
        }

        .tax-invoice-table .col-qty { width: 18mm; }
        .tax-invoice-table .col-rate { width: 22mm; }
        .tax-invoice-table .col-amount { width: 26mm; }

        .tax-invoice-table .num {
          text-align: right;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        .item-title { font-weight: 600; }
        .item-sub {
          color: #666;
          font-size: 8.5pt;
          margin-top: 0.6mm;
        }

        .tax-invoice-items-total {
          margin-top: 2mm;
          font-size: 8.5pt;
          color: #666;
        }

        .tax-invoice-bottom {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 8mm;
          margin-top: 5mm;
          page-break-inside: avoid;
        }

        .tax-invoice-notes .notes-label {
          font-weight: 700;
          margin-bottom: 1mm;
        }

        .tax-invoice-notes p {
          margin: 0 0 1.2mm;
          color: #333;
          font-size: 9pt;
        }

        .tax-invoice-bank {
          margin-top: 3mm;
          font-size: 9pt;
        }

        .tax-invoice-sums {
          font-size: 9.5pt;
        }

        .sum-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 4mm;
          padding: 1.2mm 0;
        }

        .sum-row.muted { color: #555; }

        .sum-row.total {
          border-top: 0.6pt solid #bbb;
          margin-top: 1mm;
          padding-top: 2mm;
          font-weight: 700;
          font-size: 11pt;
          color: #111;
        }

        .tax-invoice-due {
          margin-top: 3mm;
          background: #e8f1fb;
          border-radius: 2mm;
          padding: 2.5mm 3mm;
          display: grid;
          grid-template-columns: 1fr auto;
          font-weight: 700;
          font-size: 11pt;
          color: #111;
        }

        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        @media print {
          html.tax-invoice-print-root,
          body.tax-invoice-print-root {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            min-height: 0 !important;
            color: #1a1a1a !important;
            color-scheme: only light !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body.tax-invoice-print-root * {
            box-shadow: none !important;
            text-shadow: none !important;
          }

          #root,
          .tax-invoice-page,
          .tax-invoice-stage {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
            width: 100% !important;
            border: none !important;
            box-shadow: none !important;
          }

          .tax-invoice-toolbar,
          [data-sonner-toaster],
          .toaster {
            display: none !important;
          }

          .tax-invoice-sheet {
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            outline: none !important;
          }

          .tax-invoice-table thead th {
            background: #163a5f !important;
            color: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .tax-invoice-mark,
          .tax-invoice-due {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
