import { classNames } from "../../lib/format";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: number;
}

interface TabsProps<T extends string> {
  tabs: Array<TabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}

export function Tabs<T extends string>({ tabs, active, onChange, ariaLabel }: TabsProps<T>) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={classNames("tab", tab.id === active && "tab-active")}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.badge ? <span className="tab-count">{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
