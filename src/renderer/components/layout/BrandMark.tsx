import { Apps24Filled } from "@fluentui/react-icons";
import { APP_NAME } from "../../../shared/branding";

export function BrandMark() {
  return (
    <div className="brand-lockup">
      <span className="brand-mark" aria-hidden="true"><Apps24Filled /></span>
      <span className="brand-copy">
        <strong>{APP_NAME}</strong>
        <span>Customer success workspace</span>
      </span>
    </div>
  );
}
