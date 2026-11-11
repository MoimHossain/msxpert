import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { classNames } from "../../lib/format";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { label, hint, error, hideLabel = false, className, ...rest },
    ref,
  ) {
    const id = useId();
    const hintId = hint ? `${id}-hint` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    return (
      <div className={classNames("field", className)}>
        <label htmlFor={id} className={hideLabel ? "sr-only" : "field-label"}>
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          className={classNames("input", error && "input-invalid")}
          aria-describedby={classNames(hintId, errorId) || undefined}
          aria-invalid={Boolean(error) || undefined}
          {...rest}
        />
        {hint ? (
          <p id={hintId} className="field-hint">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
