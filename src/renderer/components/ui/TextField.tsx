import type { ChangeEventHandler } from "react";
import { Field, Input, type InputProps } from "@fluentui/react-components";
import { classNames } from "../../lib/format";

interface TextFieldProps extends Omit<InputProps, "id" | "onChange" | "value" | "defaultValue" | "size"> {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: ChangeEventHandler<HTMLInputElement>;
}

export function TextField({
  label, hint, error, hideLabel = false, className, value, defaultValue, onChange, ...rest
}: TextFieldProps) {
  return (
    <Field
      className={classNames("field", className)}
      label={{ children: label, className: hideLabel ? "sr-only" : undefined }}
      hint={hint ?? null}
      validationMessage={error ?? null}
      validationState={error ? "error" : "none"}
    >
      <Input
        size="large"
        {...(value === undefined ? {} : { value: String(value) })}
        {...(defaultValue === undefined ? {} : { defaultValue: String(defaultValue) })}
        onChange={(event) => onChange?.(event)}
        {...rest}
      />
    </Field>
  );
}
