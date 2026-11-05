/** Agency operating as the billing party on client tax invoices (not the WP legal employer). */
export const AGENCY_NAME = "LEO Employment Services";
export const AGENCY_LEGAL_NAME = "LEO EMPLOYMENT SERVICES PVT LTD";
export const AGENCY_REG = "C20542025";
export const AGENCY_EMAIL = "leo.emp.services@gmail.com";
export const AGENCY_PHONE = "9320410";
export const AGENCY_ADDRESS = "5GG5+R82 Reesha Villa Kenery Magu";
export const AGENCY_BANK = "Maldives Islamic Bank";
export const AGENCY_ACCOUNT = "90101480044441000";
export const GST_RATE = 0.08;

export type TaxInvoiceLine = {
  index: number;
  title: string;
  subtitle: string;
  qty: number;
  rate: number;
  amount: number;
};

export type TaxInvoiceModel = {
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  draft: boolean;
  currency: string;
  monthLabel: string;
  billToName: string;
  billToAddress: string | null;
  billToTin: string | null;
  lines: TaxInvoiceLine[];
  qtyTotal: number;
  subTotal: number;
  gst: number;
  grand: number;
};

export type TaxInvoiceSource = {
  id: string;
  clientName: string;
  periodStart: string;
  status: "draft" | "locked" | string;
  invoiceNumber?: string | null;
  clientTinNumber?: string | null;
  clientAddress?: string | null;
  items: {
    employeeName: string;
    designation: string | null;
    passportNumber?: string | null;
    billRate: string;
    calendarDays: number;
    paidDays: number;
    netBill: string;
  }[];
  totals: { netBill: string };
};

function periodMonthLabel(periodStart: string, formatDate: (value: string | Date) => string): string {
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

export function buildTaxInvoice(
  run: TaxInvoiceSource,
  formatDate: (value: string | Date) => string,
): TaxInvoiceModel {
  const currency = "MVR";
  const invoiceDate = formatDate(new Date());
  const monthLabel = periodMonthLabel(run.periodStart, formatDate);
  const invoiceNo = (run.invoiceNumber ?? "").trim() || "INV-PENDING";
  const subTotal = Number(run.totals.netBill) || 0;
  const gst = Math.round((subTotal * GST_RATE + Number.EPSILON) * 100) / 100;
  const grand = Math.round((subTotal + gst + Number.EPSILON) * 100) / 100;
  const qtyTotal = run.items.reduce((n, item) => n + Number(item.paidDays || 0), 0);

  const lines: TaxInvoiceLine[] = run.items.map((item, index) => {
    const dim = item.calendarDays > 0 ? item.calendarDays : 30;
    const daily = Number(item.billRate || 0) / dim;
    const designation = item.designation ? ` (${item.designation.toLowerCase()})` : "";
    const ref = item.passportNumber?.trim() || "";
    return {
      index: index + 1,
      title: `Salary — ${item.employeeName}${designation}`,
      subtitle: ref ? `${monthLabel} · ${ref}` : monthLabel,
      qty: Number(item.paidDays) || 0,
      rate: daily,
      amount: Number(item.netBill) || 0,
    };
  });

  return {
    invoiceNo,
    invoiceDate,
    dueDate: invoiceDate,
    draft: run.status === "draft",
    currency,
    monthLabel,
    billToName: run.clientName,
    billToAddress: run.clientAddress?.trim() || null,
    billToTin: run.clientTinNumber?.trim() || null,
    lines,
    qtyTotal,
    subTotal,
    gst,
    grand,
  };
}
