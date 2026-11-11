import type { ButtonHTMLAttributes } from "react";
import { classNames } from "../../lib/format";
import { Button as FluentButton, Spinner } from "@fluentui/react-components";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  busy?: boolean;
}

export function Button({
  variant = "secondary", busy = false, className, disabled, children, type, ...rest
}: ButtonProps) {
  return (
    <FluentButton
      type={type ?? "button"}
      className={classNames("btn", `btn-${variant}`, busy && "btn-busy", className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      appearance={variant === "ghost" ? "transparent" : variant === "secondary" ? "secondary" : "primary"}
      icon={busy ? <Spinner size="tiny" /> : null}
      {...rest}
    >
      {children}
    </FluentButton>
  );
}
