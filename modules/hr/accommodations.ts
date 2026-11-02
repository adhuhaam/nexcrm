import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "../../lib/db.ts";
import { accommodationStays, accommodations, employees } from "../../lib/schema.ts";

export class AccommodationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccommodationError";
  }
}

export type AccommodationRecord = {
  id: string;
  name: string;
  address: string | null;
  capacity: number;
  dailyRate: string;
  currency: string;
  status: "active" | "inactive";
  notes: string | null;
  occupied: number;
};

export type StayRecord = {
  id: string;
  accommodationId: string;
  accommodationName: string;
  employeeId: string;
  employeeName: string;
  checkIn: string;
  checkOut: string | null;
  dailyRateSnapshot: string;
  currency: string;
  notes: string | null;
};

function dateOnly(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AccommodationError(`${label} must be YYYY-MM-DD`);
  return text;
}

function money(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new AccommodationError(`${label} must be a number`);
  return text;
}

export async function listAccommodations(): Promise<AccommodationRecord[]> {
  const result = await pool.query<{
    id: string;
    name: string;
    address: string | null;
    capacity: number;
    daily_rate: string;
    currency: string;
    status: "active" | "inactive";
    notes: string | null;
    occupied: string;
  }>(
    `select a.*,
            (select count(*)::text from accommodation_stays s
              where s.accommodation_id = a.id and s.check_out is null) as occupied
     from accommodations a
     order by a.name`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    capacity: row.capacity,
    dailyRate: row.daily_rate,
    currency: row.currency,
    status: row.status,
    notes: row.notes,
    occupied: Number(row.occupied),
  }));
}

export async function createAccommodation(input: Record<string, unknown>): Promise<AccommodationRecord> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new AccommodationError("Name is required");
  const capacity = Number(input.capacity ?? 1);
  if (!Number.isInteger(capacity) || capacity < 1) throw new AccommodationError("Capacity must be a whole number ≥ 1");
  const id = randomUUID();
  await db.insert(accommodations).values({
    id,
    name,
    address: typeof input.address === "string" && input.address.trim() ? input.address.trim() : null,
    capacity,
    dailyRate: money(input.dailyRate ?? "0", "Daily rate"),
    currency: (typeof input.currency === "string" && input.currency.trim() ? input.currency.trim() : "MVR").slice(0, 8),
    status: input.status === "inactive" ? "inactive" : "active",
    notes: typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null,
  });
  const list = await listAccommodations();
  const created = list.find((item) => item.id === id);
  if (!created) throw new AccommodationError("Could not create accommodation");
  return created;
}

export async function updateAccommodation(id: string, input: Record<string, unknown>): Promise<AccommodationRecord> {
  const existing = (await listAccommodations()).find((item) => item.id === id);
  if (!existing) throw new AccommodationError("Accommodation not found");
  const name = typeof input.name === "string" ? input.name.trim() : existing.name;
  if (!name) throw new AccommodationError("Name is required");
  const capacity = Number(input.capacity ?? existing.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) throw new AccommodationError("Capacity must be a whole number ≥ 1");
  await db
    .update(accommodations)
    .set({
      name,
      address: typeof input.address === "string" ? input.address.trim() || null : existing.address,
      capacity,
      dailyRate: money(input.dailyRate ?? existing.dailyRate, "Daily rate"),
      currency: (typeof input.currency === "string" && input.currency.trim() ? input.currency.trim() : existing.currency).slice(0, 8),
      status: input.status === "inactive" ? "inactive" : "active",
      notes: typeof input.notes === "string" ? input.notes.trim() || null : existing.notes,
      updatedAt: new Date(),
    })
    .where(eq(accommodations.id, id));
  const list = await listAccommodations();
  const updated = list.find((item) => item.id === id);
  if (!updated) throw new AccommodationError("Could not update accommodation");
  return updated;
}

export async function listActiveStays(): Promise<StayRecord[]> {
  const result = await pool.query<{
    id: string;
    accommodation_id: string;
    accommodation_name: string;
    employee_id: string;
    employee_name: string;
    check_in: string;
    check_out: string | null;
    daily_rate_snapshot: string;
    currency: string;
    notes: string | null;
  }>(
    `select s.id, s.accommodation_id, a.name as accommodation_name,
            s.employee_id, e.legal_name as employee_name,
            s.check_in::text, s.check_out::text, s.daily_rate_snapshot::text, s.currency, s.notes
     from accommodation_stays s
     join accommodations a on a.id = s.accommodation_id
     join employees e on e.id = s.employee_id
     where s.check_out is null
     order by a.name, e.legal_name`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    accommodationId: row.accommodation_id,
    accommodationName: row.accommodation_name,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    checkIn: row.check_in,
    checkOut: row.check_out,
    dailyRateSnapshot: row.daily_rate_snapshot,
    currency: row.currency,
    notes: row.notes,
  }));
}

export async function checkIn(input: {
  accommodationId: string;
  employeeId: string;
  checkIn: string;
  notes?: string | null;
}): Promise<StayRecord> {
  const house = (await listAccommodations()).find((item) => item.id === input.accommodationId);
  if (!house || house.status !== "active") throw new AccommodationError("Accommodation not found or inactive");
  if (house.occupied >= house.capacity) throw new AccommodationError("Accommodation is at capacity");
  const employee = await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1);
  if (!employee[0]) throw new AccommodationError("Employee not found");
  const active = await db
    .select()
    .from(accommodationStays)
    .where(and(eq(accommodationStays.employeeId, input.employeeId), isNull(accommodationStays.checkOut)))
    .limit(1);
  if (active[0]) throw new AccommodationError("Employee already has an active accommodation stay");
  const id = randomUUID();
  const checkInDate = dateOnly(input.checkIn, "Check-in");
  await db.insert(accommodationStays).values({
    id,
    accommodationId: input.accommodationId,
    employeeId: input.employeeId,
    checkIn: checkInDate,
    dailyRateSnapshot: house.dailyRate,
    currency: house.currency,
    notes: input.notes?.trim() || null,
  });
  const stays = await listActiveStays();
  const created = stays.find((item) => item.id === id);
  if (!created) throw new AccommodationError("Could not check in");
  return created;
}

export async function checkOut(stayId: string, checkOut: string): Promise<void> {
  const rows = await db.select().from(accommodationStays).where(eq(accommodationStays.id, stayId)).limit(1);
  const stay = rows[0];
  if (!stay) throw new AccommodationError("Stay not found");
  if (stay.checkOut) throw new AccommodationError("Stay already checked out");
  const date = dateOnly(checkOut, "Check-out");
  if (date < String(stay.checkIn)) throw new AccommodationError("Check-out cannot be before check-in");
  await db.update(accommodationStays).set({ checkOut: date }).where(eq(accommodationStays.id, stayId));
}

/** Chargeable days = stay days in [from,to] with no overlapping active client allocation. */
export async function chargePreview(from: string, to: string) {
  const periodStart = dateOnly(from, "From");
  const periodEnd = dateOnly(to, "To");
  if (periodEnd < periodStart) throw new AccommodationError("To must be on or after From");
  const result = await pool.query<{
    stay_id: string;
    employee_id: string;
    employee_name: string;
    accommodation_name: string;
    daily_rate: string;
    currency: string;
    check_in: string;
    check_out: string | null;
    chargeable_days: string;
  }>(
    `with days as (
       select s.id as stay_id, s.employee_id, e.legal_name as employee_name, a.name as accommodation_name,
              s.daily_rate_snapshot::text as daily_rate, s.currency,
              s.check_in::text, s.check_out::text,
              greatest(s.check_in, $1::date) as start_d,
              least(coalesce(s.check_out, $2::date), $2::date) as end_d
       from accommodation_stays s
       join employees e on e.id = s.employee_id
       join accommodations a on a.id = s.accommodation_id
       where s.check_in <= $2::date
         and (s.check_out is null or s.check_out >= $1::date)
     ),
     counted as (
       select d.*,
              (
                select count(*)::int from generate_series(d.start_d, d.end_d, '1 day'::interval) day
                where not exists (
                  select 1 from client_allocations ca
                  where ca.employee_id = d.employee_id
                    and ca.join_date <= day::date
                    and (ca.resign_date is null or ca.resign_date >= day::date)
                    and ca.status in ('active', 'ended')
                )
              ) as chargeable_days
       from days d
       where d.end_d >= d.start_d
     )
     select stay_id, employee_id, employee_name, accommodation_name, daily_rate, currency, check_in, check_out,
            chargeable_days::text
     from counted
     where chargeable_days > 0
     order by employee_name`,
    [periodStart, periodEnd],
  );
  return result.rows.map((row) => {
    const days = Number(row.chargeable_days);
    const rate = Number(row.daily_rate);
    return {
      stayId: row.stay_id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      accommodationName: row.accommodation_name,
      checkIn: row.check_in,
      checkOut: row.check_out,
      dailyRate: row.daily_rate,
      currency: row.currency,
      chargeableDays: days,
      amount: (days * rate).toFixed(2),
    };
  });
}
