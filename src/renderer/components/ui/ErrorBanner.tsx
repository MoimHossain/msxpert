import { Button } from "./Button";
import { MessageBar, MessageBarActions, MessageBarBody } from "@fluentui/react-components";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <MessageBar intent="error" className="error-banner">
      <MessageBarBody>{message}</MessageBarBody>
      {onRetry ? (
        <MessageBarActions><Button variant="secondary" onClick={onRetry}>
          Try again
        </Button></MessageBarActions>
      ) : null}
    </MessageBar>
  );
}
