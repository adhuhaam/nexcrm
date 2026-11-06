import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/api";
import { formatDate, formatDateRange } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import {
  AGENCY_ADDRESS,
  AGENCY_EMAIL,
  AGENCY_LEGAL_NAME,
  AGENCY_NAME,
  AGENCY_PHONE,
  AGENCY_REG,
  payrollPrintFilename,
} from "@/lib/tax-invoice";

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
  grossStaff: string;
  lopStaff: string;
  otStaff: string;
  otherDeductStaff?: string;
  deductionNote?: string | null;
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

function dailyRate(monthly: string | number, calendarDays: number): number {
  const n = Number(monthly);
  if (!Number.isFinite(n) || !calendarDays) return 0;
  return n / calendarDays;
}

export function PayrollPayslipsPage({ payRunId }: { payRunId: string }) {
  const [run, setRun] = useState<PayRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<PayRunDetail>(`/api/v1/pay-runs/${payRunId}/payslips`)
      .then((data) => {
        if (!cancelled) setRun(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load payslips");
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
  const printedOn = useMemo(() => formatDate(new Date()), []);

  useEffect(() => {
    if (!run) return;
    document.title = payrollPrintFilename({
      clientName: run.clientName,
      docType: "Payslips",
      docNumber: sheetNo,
      periodStart: run.periodStart,
    });
  }, [run, sheetNo]);

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
    return <div className="p-6 text-sm text-muted-foreground">Loading payslips…</div>;
  }

  return (
    <div className="payslips-page">
      <div className="payslips-toolbar">
        <div>
          <p className="payslips-toolbar-title">Staff payslips · {sheetNo}</p>
          <p className="payslips-toolbar-sub">
            {month} · {run.items.length} slip(s) · A4 · Print / Save as PDF
          </p>
        </div>
        <div className="payslips-toolbar-actions">
          <Button type="button" variant="outline" asChild>
            <a href="/payroll">
              <ArrowLeftIcon />
              Back to payroll
            </a>
          </Button>
          <Button type="button" onClick={() => window.print()}>
            <PrinterIcon />
            Download all (PDF)
          </Button>
        </div>
      </div>

      <div className="payslips-stage">
        {run.items.map((item, index) => {
          const currency = item.currency || "MVR";
          const gross = Number(item.grossStaff || item.staffSalary || 0);
          const lop = Number(item.lopStaff || 0);
          const ot = Number(item.otStaff || 0);
          const otherDeduct = Number(item.otherDeductStaff || 0);
          const net = Number(item.netStaff || 0);
          const rate = dailyRate(item.staffSalary, item.calendarDays);
          const slipNo = `${sheetNo}-${String(index + 1).padStart(3, "0")}`;
          const deductNote = item.deductionNote?.trim() || null;

          return (
            <article key={item.id} className="payslip-sheet" aria-label={`Payslip for ${item.employeeName}`}>
              <header className="payslip-banner">
                <div className="payslip-agency">
                  <div className="payslip-logo">
                    <span className="mark">LEO</span>
                    <span>LEO EMPLOYMENT SERVICES</span>
                  </div>
                  <div className="agency-legal">{AGENCY_LEGAL_NAME}</div>
                  <div>{AGENCY_NAME}</div>
                  <div className="agency-meta">
                    Reg. {AGENCY_REG}
                    <span className="dot">·</span>
                    {AGENCY_PHONE}
                    <span className="dot">·</span>
                    {AGENCY_EMAIL}
                  </div>
                  <div className="agency-meta">{AGENCY_ADDRESS}</div>
                </div>
                <div className="payslip-title-block">
                  <p className="doc-kicker">Official payroll document</p>
                  <h1>Payslip</h1>
                  <p className="slip-no">{slipNo}</p>
                  {run.status === "draft" ? <span className="badge">Draft</span> : <span className="badge ok">Issued</span>}
                </div>
              </header>

              <section className="payslip-period">
                <div>
                  <span className="label">Pay period</span>
                  <strong>{month}</strong>
                  <span className="sub">{formatDateRange(run.periodStart, run.periodEnd)}</span>
                </div>
                <div>
                  <span className="label">Legal employer</span>
                  <strong>{run.employerName}</strong>
                </div>
                <div>
                  <span className="label">Client / site</span>
                  <strong>{run.clientName}</strong>
                </div>
                <div>
                  <span className="label">Printed</span>
                  <strong>{printedOn}</strong>
                </div>
              </section>

              <section className="payslip-employee">
                <div>
                  <span className="label">Employee</span>
                  <strong className="emp-name">{item.employeeName}</strong>
                  <span className="sub">{item.designation?.trim() || "—"}</span>
                </div>
                <div>
                  <span className="label">Passport</span>
                  <strong className="mono">{item.passportNumber?.trim() || "—"}</strong>
                </div>
                <div>
                  <span className="label">Work permit</span>
                  <strong className="mono">{item.workPermitNumber?.trim() || "—"}</strong>
                </div>
                <div>
                  <span className="label">Attendance</span>
                  <strong>
                    {item.paidDays} paid · {item.absentDays} AB · {item.offDays} OD
                  </strong>
                  <span className="sub">
                    {item.calendarDays} calendar day(s)
                    {item.unmarkedDays > 0 ? ` · ${item.unmarkedDays} unmarked as AB` : ""}
                  </span>
                </div>
              </section>

              <div className="payslip-columns">
                <table className="payslip-table">
                  <thead>
                    <tr>
                      <th colSpan={2}>Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        Basic monthly salary
                        <span className="hint">
                          Daily rate {formatMoney(rate, currency)} × {item.calendarDays} days
                        </span>
                      </td>
                      <td className="num">{formatAmount(gross)}</td>
                    </tr>
                    <tr>
                      <td>
                        Overtime
                        <span className="hint">Staff OT for the period</span>
                      </td>
                      <td className="num">{formatAmount(ot)}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total earnings</th>
                      <th className="num">{formatAmount(gross + ot)}</th>
                    </tr>
                  </tfoot>
                </table>

                <table className="payslip-table">
                  <thead>
                    <tr>
                      <th colSpan={2}>Deductions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        Loss of pay (LOP)
                        <span className="hint">
                          {item.absentDays + item.unmarkedDays} unpaid day(s) · daily × absent
                        </span>
                      </td>
                      <td className="num">{formatAmount(lop)}</td>
                    </tr>
                    <tr>
                      <td>
                        Other deductions
                        <span className="hint">
                          {deductNote ?? (otherDeduct > 0 ? "Boat / meal / other" : "None recorded")}
                        </span>
                      </td>
                      <td className="num">{formatAmount(otherDeduct)}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total deductions</th>
                      <th className="num">{formatAmount(lop + otherDeduct)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <section className="payslip-net">
                <div>
                  <span className="label">Net pay payable</span>
                  <p className="formula">
                    Attendance {formatAmount(net - ot + otherDeduct)} + OT {formatAmount(ot)} − other{" "}
                    {formatAmount(otherDeduct)}
                  </p>
                </div>
                <div className="net-value">
                  <span className="currency">{currency}</span>
                  <strong>{formatAmount(net)}</strong>
                </div>
              </section>

              <section className="payslip-notes">
                <p>
                  This payslip is issued by {AGENCY_LEGAL_NAME} for the pay period shown. Amounts are calculated from
                  the locked attendance sheet (present / OD paid; AB and unmarked treated as unpaid). Keep this copy
                  for your records.
                </p>
              </section>

              <footer className="payslip-signs">
                <div>
                  <div className="sign-line" />
                  <strong>Employee acknowledgement</strong>
                  <span>Name &amp; signature / date</span>
                </div>
                <div>
                  <div className="sign-line" />
                  <strong>Authorised by {AGENCY_NAME}</strong>
                  <span>Payroll officer / date</span>
                </div>
              </footer>

              <p className="payslip-footer">
                {slipNo} · Page {index + 1} of {run.items.length} · {AGENCY_LEGAL_NAME}
              </p>
            </article>
          );
        })}
      </div>

      <style>{`
        .payslips-page {
          min-height: 100vh;
          background: #e8eaed;
          color: #1a1a1a;
          color-scheme: only light;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .payslips-toolbar {
          position: sticky;
          top: 0;
          z-index: 20;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.85rem 1.25rem;
          border-bottom: 1px solid #d7dbe3;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(8px);
        }

        .payslips-toolbar-title {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .payslips-toolbar-sub {
          margin: 0.15rem 0 0;
          color: #667085;
          font-size: 0.8rem;
        }

        .payslips-toolbar-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .payslips-stage {
          display: grid;
          gap: 1.5rem;
          justify-items: center;
          padding: 1.5rem 1rem 3rem;
        }

        .payslip-sheet {
          box-sizing: border-box;
          width: 210mm;
          min-height: 297mm;
          padding: 14mm 14mm 12mm;
          background: #fff;
          border: 1px solid #d0d5dd;
          box-shadow: 0 18px 40px -28px rgb(15 23 42 / 45%);
          display: grid;
          grid-template-rows: auto auto auto 1fr auto auto auto auto;
          gap: 0;
          page-break-after: always;
          break-after: page;
        }

        .payslip-sheet:last-child {
          page-break-after: auto;
          break-after: auto;
        }

        .payslip-banner {
          display: flex;
          justify-content: space-between;
          gap: 1.25rem;
          padding-bottom: 0.9rem;
          border-bottom: 2.5px solid #1a2b6b;
        }

        .payslip-logo {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          margin-bottom: 0.35rem;
          font-size: 0.72rem;
          font-weight: 750;
          letter-spacing: 0.04em;
          color: #1a2b6b;
        }

        .payslip-logo .mark {
          display: grid;
          place-items: center;
          width: 2rem;
          height: 2rem;
          border-radius: 0.45rem;
          background: #1a2b6b;
          color: #fff;
          font-size: 0.65rem;
          font-weight: 800;
        }

        .agency-legal {
          font-size: 0.92rem;
          font-weight: 750;
          letter-spacing: -0.02em;
          color: #111827;
        }

        .agency-meta {
          margin-top: 0.15rem;
          color: #667085;
          font-size: 0.72rem;
          line-height: 1.35;
        }

        .agency-meta .dot {
          margin: 0 0.35rem;
          opacity: 0.55;
        }

        .payslip-title-block {
          text-align: right;
          min-width: 10rem;
        }

        .doc-kicker {
          margin: 0;
          color: #2d5cfe;
          font-size: 0.62rem;
          font-weight: 750;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .payslip-title-block h1 {
          margin: 0.15rem 0 0.2rem;
          font-size: 1.85rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: #1a2b6b;
          line-height: 1;
        }

        .slip-no {
          margin: 0;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.78rem;
          font-weight: 650;
          color: #344054;
        }

        .badge {
          display: inline-block;
          margin-top: 0.45rem;
          border-radius: 999px;
          padding: 0.15rem 0.55rem;
          background: #fff7ed;
          color: #c2410c;
          font-size: 0.65rem;
          font-weight: 750;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .badge.ok {
          background: #ecfdf3;
          color: #067647;
        }

        .payslip-period,
        .payslip-employee {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.65rem 1rem;
          margin-top: 0.95rem;
          padding: 0.85rem 0.95rem;
          border: 1px solid #e4e7ec;
          border-radius: 0.65rem;
          background: #f8fafc;
        }

        .payslip-employee {
          margin-top: 0.65rem;
          background: #fff;
        }

        .label {
          display: block;
          margin-bottom: 0.15rem;
          color: #667085;
          font-size: 0.62rem;
          font-weight: 750;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .payslip-period strong,
        .payslip-employee strong {
          display: block;
          font-size: 0.88rem;
          font-weight: 700;
          color: #101828;
          line-height: 1.25;
        }

        .emp-name {
          font-size: 1.05rem !important;
          letter-spacing: -0.02em;
        }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.82rem !important;
        }

        .sub {
          display: block;
          margin-top: 0.12rem;
          color: #667085;
          font-size: 0.74rem;
        }

        .payslip-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
          margin-top: 0.9rem;
          align-items: start;
        }

        .payslip-table {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid #d0d5dd;
          border-radius: 0.55rem;
          overflow: hidden;
          font-size: 0.8rem;
        }

        .payslip-table th,
        .payslip-table td {
          padding: 0.55rem 0.65rem;
          border-bottom: 1px solid #e4e7ec;
          vertical-align: top;
        }

        .payslip-table thead th {
          background: #1a2b6b;
          color: #fff;
          font-size: 0.7rem;
          font-weight: 750;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-align: left;
        }

        .payslip-table td .hint {
          display: block;
          margin-top: 0.15rem;
          color: #98a2b3;
          font-size: 0.68rem;
        }

        .payslip-table .num {
          text-align: right;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          font-weight: 650;
        }

        .payslip-table tfoot th {
          background: #f2f4f7;
          color: #344054;
          font-size: 0.76rem;
          font-weight: 750;
          border-bottom: 0;
        }

        .payslip-net {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-top: 0.9rem;
          padding: 0.95rem 1.05rem;
          border-radius: 0.7rem;
          background: linear-gradient(135deg, #1a2b6b 0%, #2d5cfe 100%);
          color: #fff;
        }

        .payslip-net .label {
          color: rgb(255 255 255 / 72%);
        }

        .payslip-net .formula {
          margin: 0.25rem 0 0;
          font-size: 0.72rem;
          color: rgb(255 255 255 / 78%);
        }

        .net-value {
          display: flex;
          align-items: baseline;
          gap: 0.45rem;
          text-align: right;
        }

        .net-value .currency {
          font-size: 0.85rem;
          font-weight: 700;
          opacity: 0.85;
        }

        .net-value strong {
          font-size: 1.85rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }

        .payslip-notes {
          margin-top: 0.85rem;
          padding: 0.7rem 0.85rem;
          border: 1px dashed #d0d5dd;
          border-radius: 0.55rem;
          color: #475467;
          font-size: 0.72rem;
          line-height: 1.45;
        }

        .payslip-notes p {
          margin: 0;
        }

        .payslip-signs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-top: auto;
          padding-top: 1.75rem;
        }

        .sign-line {
          height: 0;
          margin-bottom: 0.45rem;
          border-bottom: 1px solid #98a2b3;
        }

        .payslip-signs strong {
          display: block;
          font-size: 0.78rem;
          font-weight: 700;
          color: #101828;
        }

        .payslip-signs span {
          display: block;
          margin-top: 0.1rem;
          color: #667085;
          font-size: 0.68rem;
        }

        .payslip-footer {
          margin: 1rem 0 0;
          padding-top: 0.55rem;
          border-top: 1px solid #e4e7ec;
          color: #98a2b3;
          font-size: 0.65rem;
          text-align: center;
          letter-spacing: 0.02em;
        }

        @media print {
          html.tax-invoice-print-root,
          body.tax-invoice-print-root {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body.tax-invoice-print-root * {
            box-shadow: none !important;
          }

          .payslips-toolbar {
            display: none !important;
          }

          .payslips-page,
          .payslips-stage {
            background: #fff !important;
            padding: 0 !important;
            gap: 0 !important;
          }

          .payslip-sheet {
            width: auto;
            min-height: auto;
            margin: 0;
            padding: 10mm 12mm;
            border: none !important;
            box-shadow: none !important;
            page-break-after: always;
            break-after: page;
          }

          .payslip-sheet:last-child {
            page-break-after: auto;
            break-after: auto;
          }

          .payslip-net,
          .payslip-table thead th,
          .badge,
          .badge.ok {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        @page {
          size: A4 portrait;
          margin: 8mm;
        }
      `}</style>
    </div>
  );
}
