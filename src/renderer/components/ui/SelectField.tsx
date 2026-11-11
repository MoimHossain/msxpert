import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { classNames } from "../../lib/format";

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  hideLabel?: boolean;
  children: ReactNode;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField({ label, hideLabel = false, className, children, ...rest }, ref) {
    const id = useId();
    return (
      <div className={classNames("field", className)}>
        <label htmlFor={id} className={hideLabel ? "sr-only" : "field-label"}>
          {label}
        </label>
        <select ref={ref} id={id} className="select" {...rest}>
          {children}
        </select>
      </div>
    );
  },
);
