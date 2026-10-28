import React from "react";
export function AppShell({ title, description, eyebrow, actions, children }) {
  return (
    <main className="fixture-shell">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow ? <p className="text-sm text-muted-foreground">{eyebrow}</p> : null}
          <h1 className="text-3xl font-semibold">{title}</h1>
          {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </header>
      {children}
    </main>
  );
}
