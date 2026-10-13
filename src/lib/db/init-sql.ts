/** Idempotent bootstrap, mirrors schema.ts. Runs once per process on first DB access. */
export const INIT_SQL = `
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  stage text NOT NULL DEFAULT 'connect',
  timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
  busy_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS connections (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  provider text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, provider)
);
CREATE TABLE IF NOT EXISTS brains (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id),
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS budgets (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id),
  monthly_limit numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ILS',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS budget_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  month text NOT NULL,
  amount numeric NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  role text NOT NULL,
  kind text NOT NULL DEFAULT 'chat',
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_ws_idx ON messages (workspace_id, id);
CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  card jsonb NOT NULL,
  action jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE TABLE IF NOT EXISTS activity (
  id serial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kind text NOT NULL,
  summary text NOT NULL,
  detail jsonb,
  ok boolean NOT NULL DEFAULT true,
  cost_minor integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;
