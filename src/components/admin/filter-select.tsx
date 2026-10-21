"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { ChevronDown } from "@/components/icons";

/** A labelled select that updates one URL filter, keeping the others. */
export function FilterSelect({
  label,
  name,
  value,
  options,
  base,
  keep,
}: {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  base: string;
  keep: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const params = new URLSearchParams();
          for (const [key, val] of Object.entries({ ...keep, [name]: event.target.value || undefined })) {
            if (val && key !== "id") params.set(key, val);
          }
          const query = params.toString();
          router.push(query ? `${base}?${query}` : base, { scroll: false });
        }}
        className="field field-sm h-10 min-w-0 max-w-[15rem] appearance-none pr-9 text-sm font-medium"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}
