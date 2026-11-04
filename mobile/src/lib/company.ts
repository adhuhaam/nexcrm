export type CompanyDraft = {
  id: string | null;
  kind: "employer" | "client";
  legalName: string;
  registrationNumber: string;
  registeredAddress: string;
  country: string;
  businessActivity: string;
  phone: string;
  email: string;
  documentPrefix: string;
  signatoryName: string;
  signatoryTitle: string;
};

export function blankCompany(kind: "employer" | "client" = "employer"): CompanyDraft {
  return {
    id: null,
    kind,
    legalName: "",
    registrationNumber: "",
    registeredAddress: "",
    country: "",
    businessActivity: "",
    phone: "",
    email: "",
    documentPrefix: "",
    signatoryName: "",
    signatoryTitle: "",
  };
}

export function companyPayload(draft: CompanyDraft): Record<string, unknown> {
  return { ...draft };
}
