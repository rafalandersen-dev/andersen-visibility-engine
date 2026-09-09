import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useRef, type ReactNode } from "react";
import {
  Bell,
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
import { useT, getUiLocaleOverride, setUiLocaleOverride } from "@/i18n";
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
    tKey: "shell.nav.home",
    to: "/app",
    icon: House,
    exact: true,
    paths: ["/app"],
    children: [],
  },
  {
    id: "notifications",
    tKey: "notifications.title",
    to: "/app/notifications",
    icon: Bell,
    paths: ["/app/notifications"],
    children: [],
  },
  {
    id: "plan",
    tKey: "shell.nav.plan",
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
      { tKey: "shell.nav.planWorkspace", to: "/app/plan", icon: ListBullets },
      {
        tKey: "shell.nav.discover",
        to: "/app/plan",
        search: { view: "discover" },
        icon: Binoculars,
      },
      { tKey: "shell.nav.onpage", to: "/app/audit", icon: Gauge },
      { tKey: "shell.nav.competitors", to: "/app/competitors", icon: UsersThree },
      { tKey: "shell.nav.authority", to: "/app/authority", icon: Medal },
      { tKey: "shell.nav.aiReadiness", to: "/app/ai-visibility", icon: Binoculars },
      { tKey: "shell.nav.proposals", to: "/app/actions", icon: Tray, pendingBadge: true },
    ],
  },
  {
    id: "content",
    tKey: "shell.nav.content",
    to: "/app/editor",
    icon: FileText,
    paths: ["/app/editor", "/app/ai-evaluation", "/app/generations"],
    children: [
      { tKey: "shell.nav.contentLibrary", to: "/app/editor", icon: FileText },
      { tKey: "generationResults.title", to: "/app/generations", icon: Tray },
      { tKey: "shell.nav.aiEvaluation", to: "/app/ai-evaluation", icon: Flask },
    ],
  },
  {
    id: "backlinks",
    tKey: "shell.nav.backlinks",
    to: "/app/backlinks",
    icon: LinkSimple,
    badgeKey: "shell.addOn",
    paths: ["/app/backlinks", "/app/link-marketplace", "/app/outreach"],
    children: [
      { tKey: "shell.nav.linkIntelligence", to: "/app/backlinks", icon: LinkSimple },
      { tKey: "shell.nav.marketplace", to: "/app/link-marketplace", icon: Storefront },
      { tKey: "shell.nav.outreach", to: "/app/outreach", icon: PaperPlaneTilt },
    ],
  },
  {
    id: "insights",
    tKey: "shell.nav.insights",
    to: "/app/analytics",
    icon: ChartLineUp,
    paths: ["/app/analytics", "/app/report"],
    children: [
      { tKey: "shell.nav.premiumAnalytics", to: "/app/analytics", icon: ChartLineUp },
      { tKey: "shell.nav.monthlyReport", to: "/app/report", icon: FileText },
    ],
  },
  {
    id: "settings",
    tKey: "shell.nav.settings",
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
      { tKey: "shell.nav.projectSetup", to: "/app/setup", icon: PencilSimple },
      { tKey: "shell.nav.services", to: "/app/services", icon: Package },
      { tKey: "shell.nav.connectedApps", to: "/app/connect", icon: PlugsConnected },
      { tKey: "shell.nav.billing", to: "/app/billing", icon: CreditCard },
      { tKey: "shell.nav.launchChecklist", to: "/app/launch-checklist", icon: Rocket },
      {
        tKey: "shell.nav.betaValidation",
        to: "/app/beta-validation",
        icon: Flask,
        ownerOnly: true,
      },
    ],
  },
] as const;

export function AppShell({
  title,
  eyebrow,
  description,
  actions,
  children,
  flush = false,
}: {
  title: string;
  eyebrow?: ReactNode;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  const location = useRouterState({ select: (state) => state.location });
  const pathname = location.pathname;
  const projects = useStore((state) => state.projects);
  const activeProjectId = useStore((state) => state.activeProjectId);
  const pendingCount = useStore((state) => countPendingForBadge(state.pendingActions, Date.now()));
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const { user, isOwner, signOut } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/", replace: true });
  }

  const sidebar = (
    <SidebarContent
      t={t}
      key={pathname}
      pathname={pathname}
      discovery={location.search.view === "discover"}
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
    <div className="milo-app flex min-h-screen bg-background text-foreground">
      <aside className="hidden h-screen w-[238px] shrink-0 lg:block lg:sticky lg:top-0">
        {sidebar}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            menuButton.current?.focus();
          }}
          className="milo-app w-[280px] max-w-[86vw] border-0 bg-[#17212b] p-0 [&>button]:text-white [&>button]:h-8 [&>button]:w-8 [&>button]:grid [&>button]:place-items-center"
        >
          <SheetTitle className="sr-only">{t("shell.primaryNav")}</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <main className="min-w-0 flex-1">
        {/* Print pages at paper width fall below the lg breakpoint, so without
            print:hidden this bar would top every printed report page. */}
        <div className="flex h-14 items-center justify-between border-b border-border bg-background px-4 backdrop-blur lg:hidden print:hidden">
          <button
            type="button"
            ref={menuButton}
            onClick={() => setMobileOpen(true)}
            aria-expanded={mobileOpen}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <ListBullets size={17} /> {t("shell.menu")}
          </button>
          <div className="font-display text-lg">Milo Growth</div>
          <Link to="/app/billing" className="text-xs text-muted-foreground">
            {t("shell.billing")}
          </Link>
        </div>

        <header className="milo-page-header bg-background">
          <div className="flex flex-wrap items-end justify-between gap-5 px-5 pb-6 pt-9 md:px-10">
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                {eyebrow ?? activeProject?.name ?? t("appShell.workspace")}
              </div>
              <h1
                className={`mt-3 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-foreground md:text-[2.5rem] ${eyebrow ? "milo-home-heading" : ""}`}
              >
                {title}
              </h1>
              {description ? (
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        </header>

        <div className={flush ? "" : "px-5 pb-9 pt-3 md:px-10"}>{children}</div>

        {!flush ? (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-6 text-[11px] text-muted-foreground md:px-9">
            <span>{t("shell.footerBuiltBy")}</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link to="/terms" className="hover:text-foreground">
                {t("shell.terms")}
              </Link>
              <Link to="/privacy" className="hover:text-foreground">
                {t("shell.privacy")}
              </Link>
              <Link to="/security" className="hover:text-foreground">
                {t("shell.security")}
              </Link>
              <Link to="/ai-disclaimer" className="hover:text-foreground">
                {t("shell.aiDisclaimer")}
              </Link>
              <Link to="/trust" className="hover:text-foreground">
                {t("shell.trust")}
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
  t,
  pathname,
  discovery,
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
  t: (key: string, vars?: Record<string, string | number>) => string;
  pathname: string;
  discovery: boolean;
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
    <div className="milo-sidebar flex h-full flex-col overflow-y-auto bg-[#17212b] px-4 pb-5 pt-8 text-[#eef0ee]">
      <Link to="/app" onClick={onNavigate} className="mx-3 pb-5">
        <div className="flex items-baseline gap-2 tracking-[-0.04em]">
          <span className="text-[32px] font-bold">milo</span>
          <span className="text-xl font-normal text-[#c6d7e8]">Growth</span>
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="my-4 grid w-full grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-[7px] border border-white/[.04] bg-white/[.075] p-3 text-left text-[13px] outline-none transition hover:bg-white/[.11] focus-visible:ring-2 focus-visible:ring-[#62adff]"
          >
            <Briefcase size={18} weight="duotone" className="text-[#a7b8ca]" />
            <span className="min-w-0">
              <span className="block truncate">
                {activeProjectName ?? t("shell.chooseProject")}
              </span>
              {import.meta.env.DEV && import.meta.env.VITE_MILO_VISUAL_QA === "true" ? (
                <span className="mt-1 block text-[10px] text-[#b0bfce]">{t("today.preview")}</span>
              ) : null}
            </span>
            <CaretDown size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="milo-app w-[232px]">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("shell.projects")}
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
            <PencilSimple /> {t("shell.editProject")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onAddProject}
            disabled={!isOwner && projects.length >= MAX_PROJECTS_PER_USER}
          >
            <Plus /> {t("shell.addProject")}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {projects.length}/{isOwner ? "∞" : MAX_PROJECTS_PER_USER}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <nav className="grid gap-1" aria-label={t("shell.primaryNav")}>
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
                    ? "bg-[#0878ed] text-white"
                    : "text-[#ccd1d2] hover:bg-white/[.05] hover:text-white")
                }
              >
                <Icon
                  size={20}
                  weight="regular"
                  className={active ? "text-white" : "text-[#a7b8ca]"}
                />
                <span className="flex-1">{t(item.tKey)}</span>
                {"badgeKey" in item ? (
                  <span className="rounded bg-white/[.12] px-1.5 py-0.5 text-[10px] text-white">
                    {t(item.badgeKey)}
                  </span>
                ) : null}
              </Link>

              {active && item.children.length > 0 ? (
                <div className="ml-[24px] mt-1 grid gap-0.5 border-l border-white/[.09] pl-3">
                  {item.children
                    .filter((child) => !("ownerOnly" in child) || !child.ownerOnly || isOwner)
                    .map((child) => {
                      const ChildIcon = child.icon;
                      const childActive =
                        pathname === child.to &&
                        (child.to !== "/app/plan" || ("search" in child ? discovery : !discovery));
                      return (
                        <Link
                          key={`${child.tKey}-${JSON.stringify("search" in child ? child.search : {})}`}
                          to={child.to}
                          search={("search" in child ? child.search : undefined) as never}
                          onClick={onNavigate}
                          className={
                            "flex items-center gap-2 rounded px-2.5 py-2 text-[12px] leading-5 transition " +
                            (childActive
                              ? "bg-white/[.08] text-white"
                              : "text-[#9fa9ad] hover:bg-white/[.04] hover:text-[#eef0ee]")
                          }
                        >
                          <ChildIcon size={14} />
                          <span className="flex-1">{t(child.tKey)}</span>
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
        <div className="text-[10px] text-[#8e999e]">{t("shell.activeProject")}</div>
        <div className="mt-1 truncate text-[12px] text-[#eef0ee]">{activeProjectName ?? "—"}</div>
        <Link
          to="/app/billing"
          onClick={onNavigate}
          className="mt-4 block rounded-md p-2 transition hover:bg-white/[.05]"
        >
          <div className="flex justify-between text-[10px] text-[#9ba5a9]">
            <span>{t("shell.projects")}</span>
            <span>
              {projects.length} / {isOwner ? "∞" : MAX_PROJECTS_PER_USER}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[.12]">
            <span
              className="block h-full rounded-full bg-[#68aaf8]"
              style={{
                width: `${Math.min(100, (projects.length / MAX_PROJECTS_PER_USER) * 100)}%`,
              }}
            />
          </div>
        </Link>
        <div className="mt-4 text-[10px] text-[#8e999e]">{t("shell.account")}</div>
        <div className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-[#eef0ee]">
          {isOwner ? <Crown size={14} className="text-[#a7b8ca]" /> : null}
          <span className="truncate">{accountEmail ?? "—"}</span>
        </div>
        <Link
          to="/app/billing"
          onClick={onNavigate}
          className="mt-3 flex items-center gap-2 text-[11px] text-[#d7dcdd] hover:text-white"
        >
          <CreditCard size={16} className="text-[#a7b8ca]" /> {t("shell.manageSubscription")}
        </Link>
        <div className="mt-4">
          <label className="text-[10px] text-[#8e999e]" htmlFor="ui-locale">
            {t("shell.language")}
          </label>
          <select
            id="ui-locale"
            className="mt-1 w-full rounded-md border border-white/[.12] bg-white/[.06] px-2 py-1.5 text-[12px] text-[#eef0ee]"
            value={getUiLocaleOverride() ?? ""}
            onChange={(e) =>
              setUiLocaleOverride(
                (e.target.value || null) as Parameters<typeof setUiLocaleOverride>[0],
              )
            }
          >
            <option value="">{t("shell.languageProjectDefault")}</option>
            <option value="en">English</option>
            <option value="pl">Polski</option>
            <option value="sv">Svenska</option>
            <option value="da">Dansk</option>
          </select>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-4 flex items-center gap-2 border-0 bg-transparent p-0 text-[12px] text-[#d7dcdd] hover:text-white"
        >
          <SignOut size={17} className="text-[#a7b8ca]" /> {t("shell.signOut")}
        </button>
      </div>
    </div>
  );
}
