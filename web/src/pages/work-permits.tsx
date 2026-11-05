import { useEffect } from "react";

/** Work permits live on the Employees page now — keep old URLs working. */
export function WorkPermitList() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const edit = params.get("edit");
    const isNew = params.get("new") === "1";
    if (edit && /^[0-9a-f-]{36}$/i.test(edit)) {
      window.location.replace(`/employees?edit=${edit}`);
      return;
    }
    if (isNew) {
      window.location.replace("/employees?new=1");
      return;
    }
    window.location.replace("/employees");
  }, []);
  return null;
}

export function WorkPermitForm({ id }: { id: string | null }) {
  useEffect(() => {
    window.location.replace(id ? `/employees?edit=${id}` : "/employees?new=1");
  }, [id]);
  return null;
}
