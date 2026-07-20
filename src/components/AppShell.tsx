import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Briefcase,
  CalendarDots,
  CaretDown,
  Binoculars,
  ChartLineUp,
  CreditCard,
  Crown,
  FileText,
  Flask,
  Gauge,
  GearSix,
  House,
  LinkSimple,
  ListBullets,
  Medal,
  Package,
  PaperPlaneTilt,
  PencilSimple,
  PlugsConnected,
  Plus,
  Rocket,
  SignOut,
  Storefront,
  Tray,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { useStore, setActiveProject } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { MAX_PROJECTS_PER_USER } from "@/lib/billing";
import { countPendingForBadge } from "@/lib/pending-actions.ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  {
    id: "home",
    label: "Home",
    to: "/app",
    icon: House,
    exact: true,
    paths: ["/app"],
    children: [],
  },
  {
    id: "plan",
    label: "Plan",
    to: "/app/plan",
    icon: CalendarDots,
    paths: [
      "/app/plan",
      "/app/opportunities",
      "/app/calendar",
      "/app/audit",
      "/app/competitors",
      "/app/authority",
      "/app/ai-visibility",
      "/app/actions",
    ],
    children: [
      { label: "Plan workspace", to: "/app/plan", icon: ListBullets },
      { label: "Discover", to: "/app/plan", search: { view: "discover" }, icon: Binoculars },
      { label: "On-page review", to: "/app/audit", icon: Gauge },
      { label: "Competitors", to: "/app/competitors", icon: UsersThree },
      { label: "Authority", to: "/app/authority", icon: Medal },
      { label: "AI readiness", to: "/app/ai-visibility", icon: Binoculars },
      { label: "Proposals", to: "/app/actions", icon: Tray, pendingBadge: true },
    ],
  },
  {
    id: "content",
    label: "Content",
    to: "/app/editor",
    icon: FileText,
    paths: ["/app/editor", "/app/ai-evaluation"],
    children: [
      { label: "Content library", to: "/app/editor", icon: FileText },
      { label: "AI evaluation", to: "/app/ai-evaluation", icon: Flask },
    ],
  },
  {
    id: "backlinks",
    label: "Backlinks",
    to: "/app/backlinks",
    icon: LinkSimple,
    badge: "Add-on",
    paths: ["/app/backlinks", "/app/link-marketplace", "/app/outreach"],
    children: [
      { label: "Link intelligence", to: "/app/backlinks", icon: LinkSimple },
      { label: "Marketplace", to: "/app/link-marketplace", icon: Storefront },
      { label: "Outreach", to: "/app/outreach", icon: PaperPlaneTilt },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    to: "/app/analytics",
    icon: ChartLineUp,
    paths: ["/app/analytics"],
    children: [{ label: "Premium analytics", to: "/app/analytics", icon: ChartLineUp }],
  },
  {
    id: "settings",
    label: "Settings",
    to: "/app/setup",
    icon: GearSix,
    paths: [
      "/app/setup",
      "/app/services",
      "/app/connect",
      "/app/billing",
      "/app/launch-checklist",
      "/app/beta-validation",
    ],
    children: [
      { label: "Project setup", to: "/app/setup", icon: PencilSimple },
      { label: "Services & products", to: "/app/services", icon: Package },
      { label: "Connected apps", to: "/app/connect", icon: PlugsConnected },
      { label: "Billing & subscription", to: "/app/billing", icon: CreditCard },
      { label: "Launch checklist", to: "/app/launch-checklist", icon: Rocket },
      { label: "Beta validation", to: "/app/beta-validation", icon: Flask, ownerOnly: true },
    ],
  },
] as const;

export function AppShell({
  title,
  description,
  actions,
  children,
  flush = false,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const projects = useStore((state) => state.projects);
  const activeProjectId = useStore((state) => state.activeProjectId);
  const pendingCount = useStore((state) => countPendingForBadge(state.pendingActions, Date.now()));
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const { user, isOwner, signOut } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/", replace: true });
  }

  const sidebar = (
    <SidebarContent
      key={pathname}
      pathname={pathname}
      projects={projects}
      activeProjectId={activeProjectId}
      activeProjectName={activeProject?.name}
      accountEmail={user?.email}
      isOwner={isOwner}
      pendingCount={pendingCount}
      onNavigate={() => setMobileOpen(false)}
      onSignOut={handleSignOut}
      onAddProject={() => {
        setMobileOpen(false);
        navigate({ to: "/app/setup", search: { new: true } });
      }}
      onEditProject={() => {
        setMobileOpen(false);
        navigate({ to: "/app/setup", search: { new: undefined } });
      }}
    />
  );

  return (
    <div className="flex min-h-screen bg-[#fbfaf6] text-foreground">
      <aside className="hidden h-screen w-[250px] shrink-0 lg:block lg:sticky lg:top-0">
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-[#101820]/55 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[280px] max-w-[86vw] shadow-2xl">
            {sidebar}
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              <X size={18} />
            </button>
          </aside>
        </div>
      ) : null}

      <main className="min-w-0 flex-1">
        <div className="flex h-14 items-center justify-between border-b border-[#e5e0d6] bg-[#fffdf8]/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <ListBullets size={17} /> Menu
          </button>
          <div className="font-display text-lg">Milo Growth</div>
          <Link to="/app/billing" className="text-xs text-muted-foreground">
            Billing
          </Link>
        </div>

        <header className="border-b border-[#e5e0d6] bg-[#fffdf8]/75">
          <div className="flex flex-wrap items-end justify-between gap-5 px-5 py-6 md:px-9">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#647183]">
                {activeProject?.name ?? t("appShell.workspace")}
              </div>
              <h1 className="mt-1 font-display text-[2rem] leading-none tracking-[-0.035em] text-[#202221]">
                {title}
              </h1>
              {description ? (
                <p className="mt-2 max-w-2xl text-[13px] text-[#697282]">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        </header>

        <div className={flush ? "" : "px-5 py-7 md:px-9"}>{children}</div>

        {!flush ? (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-6 text-[11px] text-muted-foreground md:px-9">
            <span>Milo Growth — built by Andersen Innovations</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link to="/terms" className="hover:text-foreground">
                Terms
              </Link>
              <Link to="/privacy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link to="/security" className="hover:text-foreground">
                Security
              </Link>
              <Link to="/ai-disclaimer" className="hover:text-foreground">
                AI disclaimer
              </Link>
              <span>© {new Date().getUTCFullYear()}</span>
            </div>
          </footer>
        ) : null}
      </main>
    </div>
  );
}

function SidebarContent({
  pathname,
  projects,
  activeProjectId,
  activeProjectName,
  accountEmail,
  isOwner,
  pendingCount,
  onNavigate,
  onSignOut,
  onAddProject,
  onEditProject,
}: {
  pathname: string;
  projects: Array<{ id: string; name: string }>;
  activeProjectId: string;
  activeProjectName?: string;
  accountEmail?: string;
  isOwner: boolean;
  pendingCount: number;
  onNavigate: () => void;
  onSignOut: () => void;
  onAddProject: () => void;
  onEditProject: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[radial-gradient(circle_at_30%_8%,rgba(86,111,124,.15),transparent_32%),linear-gradient(165deg,#151d24_0%,#18232c_58%,#141c23_100%)] px-4 pb-5 pt-7 text-[#eef0ee]">
      <Link to="/" onClick={onNavigate} className="mx-3 border-b border-white/[.08] pb-5">
        <div className="font-display text-[24px] tracking-[-0.02em]">Milo Growth</div>
        <div className="mt-1.5 max-w-[190px] text-[10px] uppercase leading-[1.55] tracking-[0.22em] text-[#aab0b3]">
          Monthly AI growth planner
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="my-4 grid w-full grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-[7px] border border-white/[.04] bg-white/[.075] p-3 text-left text-[13px] outline-none transition hover:bg-white/[.11] focus-visible:ring-2 focus-visible:ring-[#d2a23f]/50"
          >
            <Briefcase size={18} weight="duotone" className="text-[#d2a23f]" />
            <span className="truncate">{activeProjectName ?? "Choose a project"}</span>
            <CaretDown size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[232px]">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Projects
          </DropdownMenuLabel>
          {projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onSelect={() => {
                setActiveProject(project.id);
                onNavigate();
              }}
              className="justify-between"
            >
              <span className="truncate">{project.name}</span>
              {project.id === activeProjectId ? <span className="text-gold">•</span> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onEditProject} disabled={!activeProjectName}>
            <PencilSimple /> Edit current project
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onAddProject}
            disabled={!isOwner && projects.length >= MAX_PROJECTS_PER_USER}
          >
            <Plus /> Add project
            <span className="ml-auto text-[10px] text-muted-foreground">
              {projects.length}/{MAX_PROJECTS_PER_USER}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <nav className="grid gap-1" aria-label="Primary navigation">
        {NAV.map((item) => {
          const active =
            "exact" in item && item.exact
              ? pathname === item.to
              : item.paths.some((path) => pathname.startsWith(path));
          const Icon = item.icon;
          return (
            <div key={item.id}>
              <Link
                to={item.to}
                onClick={onNavigate}
                className={
                  "flex w-full items-center gap-3 rounded-[7px] px-3.5 py-2.5 text-left text-[14px] transition " +
                  (active
                    ? "bg-white/[.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.02)]"
                    : "text-[#ccd1d2] hover:bg-white/[.05] hover:text-white")
                }
              >
                <Icon size={20} weight={active ? "fill" : "regular"} className="text-[#d2a23f]" />
                <span className="flex-1">{item.label}</span>
                {"badge" in item ? (
                  <span className="rounded bg-white/[.12] px-1.5 py-0.5 text-[10px] text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>

              {active && item.children.length > 0 ? (
                <div className="ml-[24px] mt-1 grid gap-0.5 border-l border-white/[.09] pl-3">
                  {item.children
                    .filter((child) => !("ownerOnly" in child) || !child.ownerOnly || isOwner)
                    .map((child) => {
                      const ChildIcon = child.icon;
                      const childActive = pathname === child.to;
                      return (
                        <Link
                          key={`${child.label}-${JSON.stringify("search" in child ? child.search : {})}`}
                          to={child.to}
                          search={("search" in child ? child.search : undefined) as never}
                          onClick={onNavigate}
                          className={
                            "flex items-center gap-2 rounded px-2.5 py-1.5 text-[11px] transition " +
                            (childActive
                              ? "bg-white/[.05] text-white"
                              : "text-[#9fa9ad] hover:bg-white/[.04] hover:text-[#eef0ee]")
                          }
                        >
                          <ChildIcon size={14} />
                          <span className="flex-1">{child.label}</span>
                          {"pendingBadge" in child && child.pendingBadge && pendingCount > 0 ? (
                            <span className="rounded-full bg-[#d2a23f]/20 px-1.5 text-[9px] text-[#e5bd64]">
                              {pendingCount}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pt-6 text-[#c2c8c9]">
        <div className="text-[10px] text-[#8e999e]">Active project</div>
        <div className="mt-1 truncate text-[12px] text-[#eef0ee]">{activeProjectName ?? "—"}</div>
        <Link
          to="/app/billing"
          onClick={onNavigate}
          className="mt-4 block rounded-md p-2 transition hover:bg-white/[.05]"
        >
          <div className="flex justify-between text-[10px] text-[#9ba5a9]">
            <span>Projects</span>
            <span>
              {projects.length} / {MAX_PROJECTS_PER_USER}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[.12]">
            <span
              className="block h-full rounded-full bg-[#e0b34e]"
              style={{
                width: `${Math.min(100, (projects.length / MAX_PROJECTS_PER_USER) * 100)}%`,
              }}
            />
          </div>
        </Link>
        <div className="mt-4 text-[10px] text-[#8e999e]">Account</div>
        <div className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-[#eef0ee]">
          {isOwner ? <Crown size={14} className="text-[#d2a23f]" /> : null}
          <span className="truncate">{accountEmail ?? "—"}</span>
        </div>
        <Link
          to="/app/billing"
          onClick={onNavigate}
          className="mt-3 flex items-center gap-2 text-[11px] text-[#d7dcdd] hover:text-white"
        >
          <CreditCard size={16} className="text-[#d2a23f]" /> Manage or cancel subscription
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-4 flex items-center gap-2 border-0 bg-transparent p-0 text-[12px] text-[#d7dcdd] hover:text-white"
        >
          <SignOut size={17} className="text-[#d2a23f]" /> Sign out
        </button>
      </div>
    </div>
  );
}
