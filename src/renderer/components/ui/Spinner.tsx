import { Spinner as FluentSpinner } from "@fluentui/react-components";

interface SpinnerProps {
  label?: string;
}
export function Spinner({ label = "Loading" }: SpinnerProps) {
  return (
    <div className="spinner-wrap">
      <FluentSpinner size="tiny" label={label} labelPosition="after" />
    </div>
  );
}
