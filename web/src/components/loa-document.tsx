import { formatDate } from "@/lib/dates";
import type { LetterSnapshot } from "./loa-types";

function cell(value: string | null | undefined): string {
  return value?.trim() ? value : "—";
}

function assetSrc(id: string | null | undefined): string | null {
  return id ? `/api/v1/files/${id}/download` : null;
}

export function LoaDocument({ snapshot }: { snapshot: LetterSnapshot }) {
  const company = snapshot.company;
  const employee = snapshot.employee;
  const terms = snapshot.terms;
  const name = employee.legalName || "";
  const position = employee.occupation || "the stated position";
  const letterhead = assetSrc(snapshot.letterheadFileId ?? company.letterheadFileId);
  const seal = assetSrc(snapshot.sealFileId ?? company.sealFileId);
  const signature = assetSrc(snapshot.signatureFileId ?? company.signatureFileId);

  return (
    <article className="loa-sheet bg-white text-black shadow-sm">
      <p className="loa-bismillah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
      <header className="loa-letterhead">
        {letterhead ? (
          <img src={letterhead} alt={`${company.legalName || "Company"} letterhead`} className="loa-letterhead-art" />
        ) : null}
        <h1>{cell(company.legalName)}</h1>
        <p>
          Company Registration No. {cell(company.registrationNumber)}
        </p>
        <p>
          {cell(snapshot.email ?? company.email)} | {cell(snapshot.phone ?? company.phone)}
        </p>
        <p>{cell(snapshot.letterheadAddress ?? company.registeredAddress)}</p>
      </header>

      <h2 className="loa-title">Letter of Appointment</h2>
      <p className="loa-meta">
        <strong>Document No:</strong> {snapshot.documentNumber}
      </p>
      <p className="loa-meta">
        <strong>Date:</strong> {formatDate(snapshot.letterDate)}
      </p>

      <p>Dear {name || "………………"},</p>
      <p>
        {company.legalName || "The company"} is pleased to appoint you as {position} on the terms set out
        below. Your employment will commence upon your arrival in the Maldives.
      </p>

      <h3>Employer Details</h3>
      <table className="loa-table">
        <tbody>
          <tr>
            <th>Company name</th>
            <td>{cell(company.legalName)}</td>
          </tr>
          <tr>
            <th>Company registration</th>
            <td>{cell(company.registrationNumber)}</td>
          </tr>
          <tr>
            <th>Registered address</th>
            <td>{cell(company.registeredAddress)}</td>
          </tr>
          <tr>
            <th>Contact</th>
            <td>
              {cell(snapshot.phone ?? company.phone)} · {cell(snapshot.email ?? company.email)}
            </td>
          </tr>
          <tr>
            <th>Business activity and country</th>
            <td>
              {cell(company.businessActivity)} · {cell(company.country)}
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Employee Details</h3>
      <table className="loa-table">
        <tbody>
          <tr>
            <th>Full name</th>
            <td>{cell(employee.legalName)}</td>
          </tr>
          <tr>
            <th>Passport number</th>
            <td>{cell(employee.passportNumber)}</td>
          </tr>
          <tr>
            <th>Nationality and date of birth</th>
            <td>
              {cell(employee.nationality)} · {formatDate(employee.dateOfBirth)}
            </td>
          </tr>
          <tr>
            <th>Permanent address</th>
            <td>{cell(employee.permanentAddress)}</td>
          </tr>
          <tr>
            <th>Emergency contact</th>
            <td>{cell(employee.emergencyContact)}</td>
          </tr>
        </tbody>
      </table>

      <h3>Terms of Employment</h3>
      <table className="loa-table">
        <tbody>
          <tr>
            <th>Position</th>
            <td>{cell(employee.occupation)}</td>
          </tr>
          <tr>
            <th>Work site</th>
            <td>{cell(terms.workSite)}</td>
          </tr>
          <tr>
            <th>Site ID</th>
            <td>{cell(terms.siteCode)}</td>
          </tr>
          <tr>
            <th>Basic salary</th>
            <td>{cell(terms.basicSalary)}</td>
          </tr>
          <tr>
            <th>Benefits</th>
            <td>{cell(terms.benefits)}</td>
          </tr>
          <tr>
            <th>Paid vacation</th>
            <td>{cell(terms.paidVacation)}</td>
          </tr>
          <tr>
            <th>Working hours and weekly rest</th>
            <td>{cell(terms.workingHours)}</td>
          </tr>
          <tr>
            <th>Contract duration</th>
            <td>{cell(terms.contractDuration)}</td>
          </tr>
          <tr>
            <th>Employment status</th>
            <td>{cell(terms.employmentStatus ?? employee.employmentStatus)}</td>
          </tr>
        </tbody>
      </table>

      <h3>Employer Undertaking and Employee Acceptance</h3>
      <p>
        {company.legalName || "The employer"} confirms its commitment to employ {name || "the employee"} as{" "}
        {position} and to fulfil the salary, benefits, working arrangements, leave entitlements and other
        obligations stated in this Letter of Appointment.
      </p>

      <h3>Employee Acceptance</h3>
      <p>
        I, {name || "………………"}, holder of Passport No. {cell(employee.passportNumber)}, confirm that I have
        read and understood this Letter of Appointment and voluntarily accept the position and the terms
        stated herein. I undertake to perform my assigned duties faithfully and in accordance with company
        policies and applicable law.
      </p>

      <div className="loa-signatures">
        <div>
          <p>For {company.legalName || "the company"}</p>
          {signature ? <img src={signature} alt="Authorized signature" className="loa-signature-art" /> : null}
          {seal ? <img src={seal} alt="Company seal" className="loa-seal-art" /> : null}
          <p className="loa-sign-name">{cell(snapshot.signatoryName)}</p>
          <p>{cell(snapshot.signatoryTitle)}</p>
          <p>Date: {formatDate(snapshot.letterDate)}</p>
          {!signature ? <p>Signature: ____________________</p> : null}
        </div>
        <div>
          <p>Employee Acceptance</p>
          <p className="loa-sign-name">{cell(employee.legalName)}</p>
          <p>Passport No. {cell(employee.passportNumber)}</p>
          <p>Date: {formatDate(snapshot.letterDate)}</p>
          <p>Signature: ____________________</p>
        </div>
      </div>
    </article>
  );
}
