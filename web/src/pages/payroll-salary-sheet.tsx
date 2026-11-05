import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/api";
import { formatDate, formatDateRange } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { AGENCY_LEGAL_NAME, AGENCY_NAME } from "@/lib/tax-invoice";

type PayRunItem = {
  id: string;
  employeeName: string;
  designation: string | null;
  passportNumber?: string | null;
  workPermitNumber?: string | null;
  staffSalary: string;
  currency: string;
  calendarDays: number;
  paidDays: number;
  absentDays: number;
  offDays: number;
  unmarkedDays: number;
  lopStaff: string;
  otStaff: string;
  netStaff: string;
};

type PayRunDetail = {
  id: string;
  clientName: string;
  employerName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  salarySheetNumber: string | null;
  items: PayRunItem[];
  totals: {
    staffSalary: string;
    netStaff: string;
    unmarkedDays: number;
  };
};

function monthLabel(periodStart: string): string {
  const match = periodStart.match(/^(\d{4})-(\d{2})/);
  if (!match) return formatDate(periodStart);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[Number(match[2]) - 1]} ${match[1]}`;
}

export function PayrollSalarySheetPage({ payRunId }: { payRunId: string }) {
  const [run, setRun] = useState<PayRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<PayRunDetail>(`/api/v1/pay-runs/${payRunId}/salary-sheet`)
      .then((data) => {
        if (!cancelled) setRun(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load salary sheet");
      });
    return () => {
      cancelled = true;
    };
  }, [payRunId]);

  useEffect(() => {
    document.documentElement.classList.add("tax-invoice-print-root");
    document.body.classList.add("tax-invoice-print-root");
    return () => {
      document.documentElement.classList.remove("tax-invoice-print-root");
      document.body.classList.remove("tax-invoice-print-root");
    };
  }, []);

  const sheetNo = run?.salarySheetNumber?.trim() || "PAY-PENDING";
  const month = useMemo(() => (run ? monthLabel(run.periodStart) : ""), [run]);
  const currency = run?.items[0]?.currency ?? "MVR";
  const paidDaysTotal = run?.items.reduce((n, item) => n + item.paidDays, 0) ?? 0;
  const absentTotal = run?.items.reduce((n, item) => n + item.absentDays, 0) ?? 0;
  const lopTotal = run?.items.reduce((n, item) => n + Number(item.lopStaff || 0), 0) ?? 0;
  const otTotal = run?.items.reduce((n, item) => n + Number(item.otStaff || 0), 0) ?? 0;

  useEffect(() => {
    if (!run) return;
    document.title = `Salary sheet ${sheetNo} · ${month}`;
  }, [run, sheetNo, month]);

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

  if (!run) {
    return <div className="p-6 text-sm text-muted-foreground">Loading salary sheet…</div>;
  }

  return (
    <div className="salary-sheet-page">
      <div className="salary-sheet-toolbar">
        <div>
          <p className="salary-sheet-toolbar-title">Salary sheet · {sheetNo}</p>
          <p className="salary-sheet-toolbar-sub">
            {month} · staff pay only · {run.items.length} worker(s)
          </p>
        </div>
        <div className="salary-sheet-toolbar-actions">
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

      <div className="salary-sheet-stage">
        <article className="salary-sheet">
          <header className="salary-sheet-banner">
            <div>
              <div className="title-row">
                <h1>Salary sheet</h1>
                {run.status === "draft" ? <span className="badge">Draft</span> : <span className="badge ok">Ready</span>}
              </div>
              <p className="meta">Staff payroll acknowledgement for {month}</p>
              <p className="sheet-no">
                {sheetNo}
                <span className="sep">·</span>
                {currency} {formatAmount(run.totals.netStaff)} net total
              </p>
            </div>
            <div className="agency">
              <div className="agency-logo">
                <span className="mark">LEO</span>
                <span>LEO EMPLOYMENT SERVICES</span>
              </div>
              <div className="agency-name">{AGENCY_LEGAL_NAME}</div>
              <div>{AGENCY_NAME}</div>
            </div>
          </header>

          <section className="salary-sheet-meta-grid">
            <div>
              <span className="label">Month</span> {month}
            </div>
            <div>
              <span className="label">Period</span> {formatDateRange(run.periodStart, run.periodEnd)}
            </div>
            <div>
              <span className="label">Employer</span> {run.employerName}
            </div>
            <div>
              <span className="label">Client</span> {run.clientName}
            </div>
            <div>
              <span className="label">Staff</span> {run.items.length}
            </div>
            <div>
              <span className="label">Attendance</span> {paidDaysTotal} paid · {absentTotal} AB ·{" "}
              {run.totals.unmarkedDays} unmarked
            </div>
            <div>
              <span className="label">LOP / OT</span> {formatAmount(lopTotal)} / {formatAmount(otTotal)} {currency}
            </div>
            <div>
              <span className="label">Printed</span> {formatDate(new Date())}
            </div>
          </section>

          <table className="salary-sheet-table">
            <thead>
              <tr>
                <th className="col-idx">#</th>
                <th className="col-emp">Employee</th>
                <th className="col-des">Designation</th>
                <th className="num">Paid</th>
                <th className="num">AB</th>
                <th className="num">OD</th>
                <th className="num">LOP</th>
                <th className="num">OT</th>
                <th className="num">Net pay</th>
                <th className="col-sign">Signature</th>
              </tr>
            </thead>
            <tbody>
              {run.items.map((item, index) => (
                <tr key={item.id}>
                  <td className="col-idx">{index + 1}</td>
                  <td className="col-emp">
                    <div className="emp-name">{item.employeeName}</div>
                    {item.passportNumber ? (
                      <div className="emp-sub">
                        <span className="emp-k">Passport</span> {item.passportNumber}
                      </div>
                    ) : null}
                    {item.workPermitNumber ? (
                      <div className="emp-sub">
                        <span className="emp-k">WP</span> {item.workPermitNumber}
                      </div>
                    ) : null}
                  </td>
                  <td className="col-des">{item.designation ?? "—"}</td>
                  <td className="num">{item.paidDays}</td>
                  <td className="num">{item.absentDays}</td>
                  <td className="num">{item.offDays}</td>
                  <td className="num">{formatAmount(item.lopStaff)}</td>
                  <td className="num">{formatAmount(item.otStaff)}</td>
                  <td className="num strong">{formatAmount(item.netStaff)}</td>
                  <td className="col-sign">
                    <div className="row-sign-box" aria-label={`Signature for ${item.employeeName}`}>
                      <span className="sign-hint">Sign</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>TOTAL</td>
                <td className="num">{paidDaysTotal}</td>
                <td className="num">{absentTotal}</td>
                <td className="num">—</td>
                <td className="num">{formatAmount(lopTotal)}</td>
                <td className="num">{formatAmount(otTotal)}</td>
                <td className="num strong">{formatAmount(run.totals.netStaff)}</td>
                <td className="col-sign muted">—</td>
              </tr>
            </tfoot>
          </table>

          <p className="salary-sheet-note">
            Formula: staff monthly ÷ days-in-month × paid days (P/OD). Unmarked days count as AB. Sign beside Net pay to
            acknowledge receipt for {month}. Client bill rates are not shown on this sheet.
          </p>

          <section className="salary-sheet-office">
            <div>
              <div className="office-line">Prepared by</div>
            </div>
            <div>
              <div className="office-line">Checked / approved</div>
            </div>
          </section>
        </article>
      </div>

      <style>{`
        .salary-sheet-page {
          min-height: 100vh;
          background: #e8eaed;
          color: #1a1a1a;
          color-scheme: only light;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .salary-sheet-toolbar {
          position: sticky;
          top: 0;
          z-index: 20;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: rgba(255,255,255,0.96);
          border-bottom: 1px solid #ddd;
        }

        .salary-sheet-toolbar-title {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .salary-sheet-toolbar-sub {
          margin: 0.15rem 0 0;
          font-size: 0.75rem;
          color: #666;
        }

        .salary-sheet-toolbar-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .salary-sheet-stage {
          padding: 1.5rem 1rem 2.5rem;
        }

        .salary-sheet {
          box-sizing: border-box;
          width: 297mm;
          max-width: 100%;
          min-height: 210mm;
          margin: 0 auto;
          padding: 8mm 10mm;
          background: #fff;
          color: #111;
          font: 9pt/1.3 "Segoe UI", Helvetica, Arial, sans-serif;
          box-shadow: 0 8px 28px rgba(0,0,0,0.12);
        }

        .salary-sheet-banner {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 6mm;
          border-bottom: 1.6pt solid #0b3d66;
          padding-bottom: 3mm;
          margin-bottom: 3mm;
        }

        .title-row {
          display: flex;
          align-items: center;
          gap: 2.5mm;
          margin-bottom: 1mm;
        }

        .salary-sheet-banner h1 {
          margin: 0;
          font-size: 15pt;
          letter-spacing: 0.01em;
          color: #0b3d66;
        }

        .badge {
          display: inline-block;
          border: 1px solid #888;
          border-radius: 999px;
          padding: 0.3mm 2.2mm;
          font-size: 7.5pt;
          color: #555;
        }

        .badge.ok {
          border-color: #1a6b3c;
          color: #1a6b3c;
          background: #eef8f1;
        }

        .salary-sheet-banner .meta {
          margin: 0 0 1mm;
          color: #444;
          font-size: 8.5pt;
        }

        .sheet-no {
          margin: 0;
          font-size: 9.5pt;
          font-weight: 700;
          color: #111;
        }

        .sheet-no .sep {
          margin: 0 1.5mm;
          color: #999;
          font-weight: 400;
        }

        .agency {
          text-align: right;
          font-size: 8.5pt;
          color: #333;
        }

        .agency-logo {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 2mm;
          margin-bottom: 1.5mm;
          font-weight: 700;
          letter-spacing: 0.04em;
          font-size: 8pt;
        }

        .mark {
          width: 8mm;
          height: 8mm;
          border-radius: 50%;
          background: #0b3d66;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 7pt;
          font-weight: 700;
        }

        .agency-name {
          font-weight: 700;
          font-size: 10pt;
          color: #111;
        }

        .salary-sheet-meta-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.8mm 4mm;
          margin: 0 0 2.5mm;
          padding: 1.5mm 2mm;
          border: 0.4pt solid #d1d5db;
          background: #f9fafb;
          font-size: 7.5pt;
          line-height: 1.25;
        }

        .salary-sheet-meta-grid .label {
          color: #6b7280;
          font-size: 6.5pt;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-right: 1mm;
        }

        .salary-sheet-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          margin-bottom: 2.5mm;
        }

        .salary-sheet-table th,
        .salary-sheet-table td {
          border: 0.5pt solid #b8bfc9;
          padding: 1.3mm 1.2mm;
          vertical-align: middle;
          word-wrap: break-word;
          box-sizing: border-box;
        }

        .salary-sheet-table th {
          background: #e5e7eb;
          color: #374151;
          text-align: center;
          font-size: 6.8pt;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          font-weight: 700;
        }

        .salary-sheet-table th.col-emp {
          text-align: left;
        }

        .salary-sheet-table tbody tr:nth-child(even) td {
          background: #f9fafb;
        }

        .salary-sheet-table .num {
          text-align: center;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          width: 13mm;
        }

        .salary-sheet-table .col-idx {
          width: 6mm;
          text-align: center;
        }
        .salary-sheet-table .col-emp {
          width: 48mm;
          text-align: left;
        }
        .salary-sheet-table .col-des {
          width: 24mm;
          text-align: center;
        }
        .salary-sheet-table .col-sign {
          width: 36mm;
          text-align: center;
          vertical-align: middle;
        }
        .salary-sheet-table .col-sign.muted {
          text-align: center;
          color: #999;
          font-weight: 400;
        }

        .salary-sheet-table td.col-des,
        .salary-sheet-table td.num,
        .salary-sheet-table td.col-sign {
          text-align: center;
        }

        .row-sign-box {
          box-sizing: border-box;
          min-height: 11mm;
          width: 100%;
          border: 0.6pt solid #9aa3af;
          border-radius: 1mm;
          background: #fff;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 1mm;
        }

        .sign-hint {
          font-size: 6pt;
          color: #98a2b3;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .salary-sheet-table .strong { font-weight: 700; }
        .salary-sheet-table tfoot td {
          font-weight: 700;
          background: #e5e7eb;
          text-align: center;
        }
        .salary-sheet-table tfoot td:first-child {
          text-align: left;
        }

        .emp-name {
          font-weight: 700;
          font-size: 8pt;
          margin-bottom: 0.4mm;
          line-height: 1.2;
        }

        .emp-sub {
          color: #6b7280;
          font-size: 6.6pt;
          margin-top: 0.25mm;
          font-variant-numeric: tabular-nums;
          line-height: 1.25;
        }

        .emp-k {
          display: inline-block;
          min-width: 10mm;
          color: #9ca3af;
          font-size: 6pt;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-right: 0.8mm;
        }

        .salary-sheet-note {
          margin: 0 0 4mm;
          font-size: 7.5pt;
          color: #555;
        }

        .salary-sheet-office {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16mm;
          margin-top: 3mm;
          font-size: 8.5pt;
          page-break-inside: avoid;
        }

        .office-line {
          border-top: 0.6pt solid #333;
          margin-top: 9mm;
          padding-top: 1.2mm;
        }

        @page {
          size: A4 landscape;
          margin: 8mm 9mm;
        }

        @media print {
          html.tax-invoice-print-root,
          body.tax-invoice-print-root {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            color: #111 !important;
            color-scheme: only light !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body.tax-invoice-print-root * {
            box-shadow: none !important;
            text-shadow: none !important;
          }

          #root,
          .salary-sheet-page,
          .salary-sheet-stage {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
            width: 100% !important;
            border: none !important;
            box-shadow: none !important;
          }

          .salary-sheet-toolbar,
          [data-sonner-toaster] {
            display: none !important;
          }

          .salary-sheet {
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            border: none !important;
            box-shadow: none !important;
            outline: none !important;
          }

          .salary-sheet-table th,
          .salary-sheet-table tfoot td,
          .salary-sheet-meta-grid,
          .mark,
          .badge.ok,
          .salary-sheet-table tbody tr:nth-child(even) td {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
