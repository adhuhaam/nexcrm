import { useEffect, useState } from "react";
import { Field } from "@/components/field";
import { getJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type Designation = {
  id: string;
  name: string;
  active: boolean;
};

export function DesignationField({
  id = "designation",
  label = "Designation",
  value,
  onChange,
  hint,
  allowEmpty = true,
  emptyLabel = "Select designation",
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const [options, setOptions] = useState<Designation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getJson<{ designations: Designation[] }>("/api/v1/designations")
      .then((data) => setOptions(data.designations))
      .catch((reason: unknown) => {
        setLoadError(reason instanceof Error ? reason.message : "Could not load designations");
        setOptions([]);
      });
  }, []);

  const known = options.some((item) => item.name === value);
  const orphan = value && !known ? value : null;

  return (
    <Field id={id} label={label} hint={hint ?? (loadError ? loadError : undefined)}>
      <select
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hint || loadError ? `${id}-hint` : undefined}
        className={cn(
          "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {orphan ? (
          <option value={orphan}>
            {orphan} (not in catalog)
          </option>
        ) : null}
        {options.map((item) => (
          <option key={item.id} value={item.name}>
            {item.name}
          </option>
        ))}
      </select>
      {!hint && !loadError ? (
        <p className="text-xs text-muted-foreground">
          Manage list on{" "}
          <a href="/designations" className="underline underline-offset-2">
            Designations
          </a>
        </p>
      ) : null}
    </Field>
  );
}
