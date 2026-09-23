-- ============================================================================
-- Row Level Security (§5): enforced in EVERY table containing a tenantId.
-- The application connects as role `portcalls_app` (NOT superuser/owner).
-- Each transaction runs:  SET LOCAL app.tenant_id = '<uuid>';
-- ============================================================================

CREATE ROLE portcalls_app NOLOGIN; -- updated by IaC with a password/JWT issuer

-- Helper: current tenant from session GUC
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

-- Enable + force RLS on every tenant-scoped table
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'membership','session','vessel','client','portcall','process','milestone',
    'authorityclearance','document','invoice','payment','activity','comment',
    'outboevent','auditevent','subscription','usagerecord','onboardingrecord','license'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())', t);
  END LOOP;
END $$;

-- Outbox relay uses a separate role (portcalls_relay) that bypasses RLS only
-- for the outbox table, granted explicitly:
-- GRANT SELECT, UPDATE ON outboevent TO portcalls_relay;

-- Cross-tenant access test (run in CI):
-- SET app.tenant_id = '<tenantA>'; SELECT count(*) FROM vessel WHERE tenant_id = '<tenantB>'; -- must be 0
