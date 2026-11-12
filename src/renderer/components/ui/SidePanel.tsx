import type { ReactNode } from "react";
import { Button, DrawerBody, DrawerHeader, DrawerHeaderTitle, OverlayDrawer } from "@fluentui/react-components";
import { Dismiss24Regular } from "@fluentui/react-icons";

export function SidePanel({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  return <OverlayDrawer open position="end" size="large" className={`console-side-panel${wide ? " console-side-panel-wide" : ""}`}
    mountNode={document.querySelector<HTMLElement>(".update-app-root")}
    onOpenChange={(_event, data) => { if (!data.open) onClose(); }}>
    <DrawerHeader><DrawerHeaderTitle action={
      <Button appearance="subtle" icon={<Dismiss24Regular />} aria-label={`Close ${title}`} onClick={onClose} />
    }>{title}</DrawerHeaderTitle></DrawerHeader>
    <DrawerBody>{children}</DrawerBody>
  </OverlayDrawer>;
}
