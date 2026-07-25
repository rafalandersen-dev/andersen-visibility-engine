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
    paths: ["/app/editor", "/app/ai-evaluation"],
    children: [
      { tKey: "shell.nav.contentLibrary", to: "/app/editor", icon: FileText },
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
      t={t}
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
            aria-label={t("shell.closeNav")}
            className="absolute inset-0 bg-[#101820]/55 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[280px] max-w-[86vw] shadow-2xl">
            {sidebar}
            <button
              type="button"
              aria-label={t("shell.closeNav")}
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              <X size={18} />
            </button>
          </aside>
        </div>
      ) : null}

      <main className="min-w-0 flex-1">
        {/* Print pages at paper width fall below the lg breakpoint, so without
            print:hidden this bar would top every printed report page. */}
        <div className="flex h-14 items-center justify-between border-b border-[#e5e0d6] bg-[#fffdf8]/90 px-4 backdrop-blur lg:hidden print:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <ListBullets size={17} /> {t("shell.menu")}
          </button>
          <div className="font-display text-lg">Milo Growth</div>
          <Link to="/app/billing" className="text-xs text-muted-foreground">
            {t("shell.billing")}
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
          {t("shell.tagline")}
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="my-4 grid w-full grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-[7px] border border-white/[.04] bg-white/[.075] p-3 text-left text-[13px] outline-none transition hover:bg-white/[.11] focus-visible:ring-2 focus-visible:ring-[#d2a23f]/50"
          >
            <Briefcase size={18} weight="duotone" className="text-[#d2a23f]" />
            <span className="truncate">{activeProjectName ?? t("shell.chooseProject")}</span>
            <CaretDown size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[232px]">
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
              {projects.length}/{MAX_PROJECTS_PER_USER}
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
                    ? "bg-white/[.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.02)]"
                    : "text-[#ccd1d2] hover:bg-white/[.05] hover:text-white")
                }
              >
                <Icon size={20} weight={active ? "fill" : "regular"} className="text-[#d2a23f]" />
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
                      const childActive = pathname === child.to;
                      return (
                        <Link
                          key={`${child.tKey}-${JSON.stringify("search" in child ? child.search : {})}`}
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
        <div className="mt-4 text-[10px] text-[#8e999e]">{t("shell.account")}</div>
        <div className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-[#eef0ee]">
          {isOwner ? <Crown size={14} className="text-[#d2a23f]" /> : null}
          <span className="truncate">{accountEmail ?? "—"}</span>
        </div>
        <Link
          to="/app/billing"
          onClick={onNavigate}
          className="mt-3 flex items-center gap-2 text-[11px] text-[#d7dcdd] hover:text-white"
        >
          <CreditCard size={16} className="text-[#d2a23f]" /> {t("shell.manageSubscription")}
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
          <SignOut size={17} className="text-[#d2a23f]" /> {t("shell.signOut")}
        </button>
      </div>
    </div>
  );
}
