import assert from "node:assert/strict";
import { pool } from "../lib/db.ts";
import { migrate } from "../lib/migrate.ts";
import { createCompany, listCompanies } from "../modules/companies/companies.ts";
import {
  createExpense,
  deleteExpense,
  ExpenseError,
  listExpenses,
  updateExpense,
} from "../modules/expenses/expenses.ts";

await migrate(pool);

const clients = await listCompanies("client");
let clientId = clients[0]?.id ?? null;
if (!clientId) {
  const created = await createCompany({
    kind: "client",
    legalName: `Expense Client ${Date.now()}`,
    registrationNumber: null,
    registeredAddress: null,
    country: null,
    businessActivity: null,
    phone: null,
    email: null,
    documentPrefix: null,
    signatoryName: null,
    signatoryTitle: null,
  });
  clientId = created.id;
}

const payment = await createExpense(
  {
    expenseDate: "2026-11-01",
    amount: "150.50",
    currency: "MVR",
    category: "client_payment",
    clientCompanyId: clientId,
    counterparty: "Invoice batch",
    note: "October invoice support",
  },
  null,
);
assert.equal(payment.category, "client_payment");
assert.equal(payment.clientCompanyId, clientId);
assert.ok(payment.clientName);

const investment = await createExpense(
  {
    expenseDate: "2026-11-02",
    amount: "1000",
    category: "investment",
    counterparty: "Treasury bill",
  },
  null,
);
assert.equal(investment.clientCompanyId, null);

await assert.rejects(
  () =>
    createExpense(
      {
        expenseDate: "2026-11-02",
        amount: "10",
        category: "investment",
        clientCompanyId: clientId,
      },
      null,
    ),
  (error: unknown) => error instanceof ExpenseError && /Only client payments/.test(error.message),
);

const listed = await listExpenses({ category: "client_payment" });
assert.ok(listed.expenses.some((row) => row.id === payment.id));
assert.ok(Number(listed.totals.client_payment) >= 150.5);

const updated = await updateExpense(investment.id, { amount: "1250.00", note: "Top-up" });
assert.equal(updated.amount, "1250.00");
assert.equal(updated.note, "Top-up");

await deleteExpense(payment.id);
await deleteExpense(investment.id);

const after = await listExpenses({ q: "Treasury bill" });
assert.equal(after.expenses.some((row) => row.id === investment.id), false);

console.log("expense checks passed");
await pool.end();
