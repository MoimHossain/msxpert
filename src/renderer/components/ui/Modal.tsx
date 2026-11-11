import type { ReactNode } from "react";
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle } from "@fluentui/react-components";
import { Dismiss24Regular } from "@fluentui/react-icons";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
  closeDisabled?: boolean;
}

export function Modal({ title, onClose, children, footer, width = "md", closeDisabled = false }: ModalProps) {
  return (
    <Dialog open onOpenChange={(_event, data) => { if (!data.open && !closeDisabled) onClose(); }}>
      <DialogSurface
        className="console-dialog"
        style={{ maxWidth: width === "sm" ? 440 : width === "lg" ? 820 : 600 }}
        mountNode={document.querySelector<HTMLElement>(".update-app-root")}
      >
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" icon={<Dismiss24Regular />} aria-label="Close dialog" disabled={closeDisabled} onClick={onClose} />}>
            {title}
          </DialogTitle>
          <DialogContent className="console-dialog-content">{children}</DialogContent>
          {footer ? <DialogActions>{footer}</DialogActions> : null}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
