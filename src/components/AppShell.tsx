import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useStore, setActiveProject } from "@/lib/store";
import {
  LayoutDashboard,
  FolderCog,
  Package,
  Sparkles,
  CalendarDays,
  FileText,
  Building2,
} from "lucide-react";

type NavItem = {
  to: "/" | "/setup" | "/services" | "/opportunities" | "/calendar" | "/editor";
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/setup", label: "Project Setup", icon: FolderCog },
  { to: "/app/services", label: "Services & Products", icon: Package },
  { to: "/app/opportunities", label: "SEO Opportunities", icon: Sparkles },
  { to: "/app/calendar", label: "Content Calendar", icon: CalendarDays },
  { to: "/app/editor", label: "Content Editor", icon: FileText },
];

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const active = projects.find((p) => p.id === activeProjectId) ?? projects[0];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-6 py-7 border-b border-sidebar-border">
          <div className="text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/55">
            Andersen Innovations
          </div>
          <div className="mt-1.5 font-display text-xl leading-tight text-sidebar-foreground">
            Visibility Engine
          </div>
          <div className="mt-3 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
        </div>

        <div className="px-3 py-4">
          <div className="px-3 pb-2 text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/45">
            Workspace
          </div>
          <nav className="space-y-0.5">
            {NAV.map((item) => {
              const isActive = item.exact
                ? pathname === item.to
                : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors " +
                    (isActive
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")
                  }
                >
                  <Icon className="h-4 w-4 text-gold/80" strokeWidth={1.6} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-3 border-t border-sidebar-border">
          <div className="px-3 pb-2 text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/45">
            Active project
          </div>
          <div className="space-y-1">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveProject(p.id)}
                className={
                  "w-full flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors " +
                  (p.id === activeProjectId
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60")
                }
              >
                <Building2 className="h-3.5 w-3.5 text-gold/80" strokeWidth={1.6} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        <header className="border-b border-border bg-card/60 backdrop-blur">
          <div className="px-6 md:px-10 py-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {active?.name}
              </div>
              <h1 className="mt-1 font-display text-2xl md:text-3xl text-foreground">
                {title}
              </h1>
              {description ? (
                <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>
        </header>
        <div className="px-6 md:px-10 py-8">{children}</div>
      </main>
    </div>
  );
}
