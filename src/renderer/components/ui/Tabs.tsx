import { Badge, Tab, TabList } from "@fluentui/react-components";

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
    <TabList className="tabs" selectedValue={active} aria-label={ariaLabel} onTabSelect={(_event, data) => {
      const selected = tabs.find((tab) => tab.id === data.value);
      if (selected) onChange(selected.id);
    }}>
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          value={tab.id}
        >
          {tab.label}
          {tab.badge ? <Badge appearance="tint" color="brand" size="small">{tab.badge}</Badge> : null}
        </Tab>
      ))}
    </TabList>
  );
}
