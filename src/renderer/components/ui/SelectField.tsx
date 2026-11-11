import type { ChangeEventHandler, ReactNode } from "react";
import { Field, Select, type SelectProps } from "@fluentui/react-components";
import { classNames } from "../../lib/format";

interface SelectFieldProps extends Omit<SelectProps, "id" | "onChange" | "size"> {
  label: string;
  hideLabel?: boolean;
  children: ReactNode;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
}

export function SelectField({ label, hideLabel = false, className, children, onChange, ...rest }: SelectFieldProps) {
  return (
    <Field className={classNames("field", className)} label={{ children: label, className: hideLabel ? "sr-only" : undefined }}>
      <Select size="large" onChange={(event) => onChange?.(event)} {...rest}>
        {children}
      </Select>
    </Field>
  );
}
