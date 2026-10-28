-- Bounded weekly observation — table privacy follow-up (28 October 2026).
--
-- Why this exists. The strict production installation guard rolled the
-- 20261028170000 transaction back BEFORE COMMIT: that environment's DEFAULT
-- PRIVILEGES in schema public grant SELECT and INSERT on newly created tables
-- to the optional environment role sandbox_exec, which is LOGIN and BYPASSRLS
-- and NOT superuser — an actual reader, not a harmless owner alias. The
-- original migration revokes the four bounded tables from PUBLIC, anon,
-- authenticated and service_role only, so that inherited default grant
-- survived table creation and the guard correctly refused the install. No
-- bounded object, journal row, budget or function identity was left behind.
--
-- What this does, and nothing more: when (and only when) that optional role
-- exists, REVOKE ALL PRIVILEGES on exactly the four bounded tables from it.
-- It does NOT weaken or bypass the guard, does NOT alter DEFAULT PRIVILEGES
-- (every unrelated and future table keeps the environment's own
-- configuration), creates/alters/drops no role, adds no function, endpoint or
-- grant, and touches no other table, policy, RLS setting, budget or lifetime
-- bound. Where the role is absent the migration is a documented no-op that
-- changes no ACL at all, so it is safe in every environment.
--
-- Function-level default privileges are a DIFFERENT question and are
-- deliberately out of scope here: this follow-up performs no general ACL
-- cleanup and leaves the operator RPC grants from 20261028170000 untouched.

-- An absent prerequisite table must fail loudly rather than be skipped: a
-- silent no-op would look identical to a successful privacy install.
DO $$
DECLARE absent text;
BEGIN
  SELECT string_agg(t.name, ',' ORDER BY t.name) INTO absent
    FROM (VALUES ('weekly_test_windows'), ('weekly_test_window_slots'),
                 ('weekly_test_window_contracts'), ('weekly_test_window_allowances')) t(name)
    WHERE to_regclass('public.' || t.name) IS NULL;
  IF absent IS NOT NULL THEN
    RAISE EXCEPTION 'bounded_window_tables_absent: %', absent;
  END IF;
END $$;

DO $$
DECLARE leftover text;
BEGIN
  -- The role is an OPTIONAL environment fixture, never created or modified here.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN RETURN; END IF;

  REVOKE ALL PRIVILEGES ON public.weekly_test_windows, public.weekly_test_window_slots,
    public.weekly_test_window_contracts, public.weekly_test_window_allowances
    FROM sandbox_exec;

  -- Verify the intended end state instead of trusting the REVOKE: a privilege
  -- still reachable through column grants, role membership or a superuser
  -- attribute is NOT privacy, so fail closed and leave the install refused.
  -- The ACL-entry test is deliberately privilege-name-free, so a right this
  -- list does not enumerate (MAINTAIN on 17, or anything later) is still
  -- caught without naming a keyword that older servers would reject.
  SELECT string_agg(t.name, ',' ORDER BY t.name) INTO leftover
    FROM (VALUES ('weekly_test_windows'), ('weekly_test_window_slots'),
                 ('weekly_test_window_contracts'), ('weekly_test_window_allowances')) t(name)
    WHERE has_table_privilege('sandbox_exec', 'public.' || t.name,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_any_column_privilege('sandbox_exec', 'public.' || t.name,
            'SELECT,INSERT,UPDATE,REFERENCES')
       OR EXISTS (SELECT 1 FROM pg_class c
            JOIN pg_namespace s ON s.oid = c.relnamespace,
            LATERAL aclexplode(c.relacl) a
            WHERE s.nspname = 'public' AND c.relname = t.name
              AND c.relacl IS NOT NULL AND a.grantee = 'sandbox_exec'::regrole);
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'bounded_window_table_privacy_incomplete: %', leftover;
  END IF;
END $$;
