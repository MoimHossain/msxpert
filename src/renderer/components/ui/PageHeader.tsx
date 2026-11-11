import type { ReactNode } from "react";

export interface Crumb {
  label: string;
  onClick?: () => void;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumb?: Crumb[];
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label="Breadcrumb" className="breadcrumb">
            {breadcrumb.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`}>
                {index > 0 ? <span aria-hidden="true"> / </span> : null}
                {crumb.onClick ? (
                  <button type="button" className="breadcrumb-link" onClick={crumb.onClick}>
                    {crumb.label}
                  </button>
                ) : (
                  <span className="breadcrumb-current">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
