export type OfficeApp = {
  id: string;
  label: string;
  short: string;
  href: string;
  matchPrefix: string;
};

export const officeApps: OfficeApp[] = [
  {
    id: "expenses",
    label: "Finance",
    short: "FN",
    href: "/apps/expenses",
    matchPrefix: "/apps/expenses",
  },
];

export function appIsActive(app: OfficeApp, path = window.location.pathname): boolean {
  return path === app.matchPrefix || path.startsWith(`${app.matchPrefix}/`);
}
