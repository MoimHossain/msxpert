import type { ReactNode } from "react";
import { Menu, MenuItem, MenuList, MenuPopover, MenuTrigger } from "@fluentui/react-components";
import { useToast } from "../../state/ToastProvider";

export function MsxLink({ url, label, children }: { url: string; label: string; children?: ReactNode }) {
  const { notify } = useToast();
  const openLink = async (target: string) => {
    try { await window.desktop.openExternal(target); }
    catch (error) { notify(`Could not open link: ${error instanceof Error ? error.message : String(error)}`, "critical"); }
  };
  const copyLink = async () => {
    try { await window.desktop.copyMsxLink(url); notify(`${label} link copied.`, "positive"); }
    catch (error) { notify(`Could not copy ${label.toLowerCase()} link: ${error instanceof Error ? error.message : String(error)}`, "critical"); }
  };
  return <Menu openOnContext>
    <MenuTrigger disableButtonEnhancement>
      <a href={url} title="Right-click to copy this link" onClick={event => {
        event.preventDefault(); void openLink(event.currentTarget.href);
      }}>{children ?? label}</a>
    </MenuTrigger>
    <MenuPopover>
      <MenuList><MenuItem onClick={() => void copyLink()}>Copy to clipboard</MenuItem></MenuList>
    </MenuPopover>
  </Menu>;
}
