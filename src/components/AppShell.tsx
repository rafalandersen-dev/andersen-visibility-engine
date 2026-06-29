import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useStore, setActiveProject } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { MAX_PROJECTS_PER_USER } from "@/lib/pricing";
import {
  LayoutDashboard,
  FolderCog,
  Package,
  Gauge,
  Sparkles,
  CalendarDays,
  FileText,
  Building2,
  CreditCard,
  LogOut,
  Crown,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/setup", label: "Project Setup", icon: FolderCog },
  { to: "/app/services", label: "Services & Products", icon: Package },
  { to: "/app/audit", label: "Site Audit", icon: Gauge },
  { to: "/app/opportunities", label: "SEO Opportunities", icon: Sparkles },
  { to: "/app/calendar", label: "Content Calendar", icon: CalendarDays },
  { to: "/app/editor", label: "Content Editor", icon: FileText },
  { to: "/app/billing", label: "Billing", icon: CreditCard },
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
  const { user, isOwner, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <Link to="/" className="px-6 py-7 border-b border-sidebar-border block">
          <div className="font-display text-xl leading-tight text-sidebar-foreground">
            Milo Growth
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/55">
            Monthly AI growth planner
          </div>
          <div className="mt-3 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
        </Link>

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
                  to={item.to as never}
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

        {projects.length > 0 ? (
          <div className="p-3 border-t border-sidebar-border">
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
        ) : null}

        <div className="mt-auto p-3 border-t border-sidebar-border">
          {!isOwner ? (
            <Link
              to="/app/billing"
              className="block px-3 py-2 mb-1 rounded-md hover:bg-sidebar-accent/60"
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/45">
                <span>Projects</span>
                <span>{projects.length}/{MAX_PROJECTS_PER_USER}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-sidebar-accent overflow-hidden">
                <div
                  className="h-full bg-gold/80 transition-all"
                  style={{ width: `${Math.min(100, (projects.length / MAX_PROJECTS_PER_USER) * 100)}%` }}
                />
              </div>
            </Link>
          ) : null}
          <div className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/45">
              Account
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-sm text-sidebar-foreground/85 truncate">
              {isOwner ? <Crown className="h-3.5 w-3.5 text-gold" /> : null}
              <span className="truncate">{user?.email ?? "—"}</span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-1 w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4 text-gold/80" strokeWidth={1.6} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        <header className="border-b border-border bg-card/60 backdrop-blur">
          <div className="px-6 md:px-10 py-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {active?.name ?? "Workspace"}
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
        <footer className="px-6 md:px-10 py-6 border-t border-border text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>Milo Growth — built by Andersen Innovations</span>
          <span>© {new Date().getUTCFullYear()}</span>
        </footer>
      </main>
    </div>
  );
}
