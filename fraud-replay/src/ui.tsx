import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeading({ title, description, children }: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return <div className="page-heading">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {children && <div className="heading-actions">{children}</div>}
  </div>;
}

export function PanelHeading({ title, description, children }: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return <div className="section-header">
    <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
    {children}
  </div>;
}

export function StateMessage({ title, detail, busy, error, children }: {
  title: string;
  detail?: string;
  busy?: boolean;
  error?: boolean;
  children?: ReactNode;
}) {
  const Icon = busy ? LoaderCircle : error ? AlertCircle : Inbox;
  return <div className="state-message" role={error ? "alert" : "status"}>
    <Icon className={busy ? "spinner" : undefined} size={20} aria-hidden="true" />
    <div><strong>{title}</strong>{detail && <p>{detail}</p>}</div>
    {children}
  </div>;
}
