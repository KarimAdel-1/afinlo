import type { ReactNode } from "react";

/** The top of a dashboard page: its title, a line on what it's for, and its actions on the right. */
export function PageHead({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="hl-page-head">
      <div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="hl-page-actions">{actions}</div>}
    </header>
  );
}
