/** Idempotent bootstrap, mirrors schema.ts. Runs once per process on first DB access. */
export const INIT_SQL = `
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  stage text NOT NULL DEFAULT 'connect',
  timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
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
  status text NOT NULL DEFAULT 'ok',
  status_reason text,
  checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, provider)
);
ALTER TABLE connections ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ok';
ALTER TABLE connections ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS checked_at timestamptz;
CREATE TABLE IF NOT EXISTS facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  topic text NOT NULL,
  text text NOT NULL,
  kind text NOT NULL DEFAULT 'fact',
  status text NOT NULL DEFAULT 'suggested',
  source text NOT NULL,
  source_detail text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS facts_ws_idx ON facts (workspace_id, topic);
CREATE TABLE IF NOT EXISTS budgets (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id),
  monthly_limit numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ILS',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS budget_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  proposal_id uuid UNIQUE,
  month text NOT NULL,
  amount numeric NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  title text NOT NULL DEFAULT 'שיחה חדשה',
  category text NOT NULL DEFAULT 'general',
  auto boolean NOT NULL DEFAULT true,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_ws_idx ON conversations (workspace_id, updated_at DESC);
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));
CREATE TABLE IF NOT EXISTS rate_limits (
  key text NOT NULL,
  window_start bigint NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
CREATE TABLE IF NOT EXISTS support_requests (
  id serial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid,
  topic text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS journey (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  item text NOT NULL,
  status text NOT NULL,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, item)
);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unread boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS nudges (
  id serial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kind text NOT NULL,
  key text NOT NULL,
  day text NOT NULL,
  conversation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, kind, key)
);
CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  role text NOT NULL,
  kind text NOT NULL DEFAULT 'chat',
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments jsonb;
CREATE INDEX IF NOT EXISTS messages_ws_idx ON messages (workspace_id, id);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages (conversation_id, id);
CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  version_hash text NOT NULL,
  dedupe_key text NOT NULL,
  month text NOT NULL,
  reserved numeric NOT NULL DEFAULT 0,
  card jsonb NOT NULL,
  action jsonb NOT NULL,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  attempts integer NOT NULL DEFAULT 0,
  superseded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  finished_at timestamptz
);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS conversation_id uuid;
CREATE INDEX IF NOT EXISTS proposals_ws_idx ON proposals (workspace_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS proposals_pending_key ON proposals (workspace_id, dedupe_key) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status, created_at);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS metrics jsonb;
CREATE TABLE IF NOT EXISTS model_calls (
  id serial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  job_id uuid,
  agent text NOT NULL,
  model text NOT NULL,
  step integer NOT NULL,
  input_tokens integer NOT NULL,
  cache_read_tokens integer NOT NULL,
  cache_write_tokens integer NOT NULL,
  output_tokens integer NOT NULL,
  ms integer NOT NULL,
  cost_usd numeric(12,6) NOT NULL,
  stop_reason text,
  tools jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_calls_job ON model_calls (job_id, id);
CREATE TABLE IF NOT EXISTS job_events (
  id serial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs(id),
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_events_job_idx ON job_events (job_id, id);
CREATE TABLE IF NOT EXISTS usage (
  id serial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kind text NOT NULL,
  month text NOT NULL,
  amount numeric NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_ws_idx ON usage (workspace_id, kind, month);
CREATE TABLE IF NOT EXISTS media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  content_type text NOT NULL,
  bytes bytea NOT NULL,
  size integer NOT NULL,
  source text NOT NULL,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE media ALTER COLUMN bytes DROP NOT NULL;
ALTER TABLE media ADD COLUMN IF NOT EXISTS storage text NOT NULL DEFAULT 'db';
ALTER TABLE media ADD COLUMN IF NOT EXISTS key text;
ALTER TABLE media ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE media ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE media ADD COLUMN IF NOT EXISTS tags jsonb;
ALTER TABLE media ADD COLUMN IF NOT EXISTS folder text;
ALTER TABLE media ADD COLUMN IF NOT EXISTS in_library boolean NOT NULL DEFAULT true;
ALTER TABLE media ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS media_ws_idx ON media (workspace_id, created_at DESC);
CREATE TABLE IF NOT EXISTS agent_runs (
  id serial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  agent text NOT NULL,
  task text NOT NULL,
  output text NOT NULL,
  proposal_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE media ADD COLUMN IF NOT EXISTS filename text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS agent text;
CREATE TABLE IF NOT EXISTS agent_playbooks (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  agent text NOT NULL,
  content text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, agent)
);
CREATE TABLE IF NOT EXISTS agent_playbook_history (
  id serial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  agent text NOT NULL,
  version integer NOT NULL,
  content text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_playbook_history_ws ON agent_playbook_history (workspace_id, agent, version);
CREATE TABLE IF NOT EXISTS advertiser_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  scope text NOT NULL,
  ad_account_id text,
  proposal_id uuid,
  beneficiary_id text NOT NULL,
  beneficiary_name text NOT NULL,
  payer_id text NOT NULL,
  payer_name text NOT NULL,
  name_source text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS advertiser_identities_one ON advertiser_identities (workspace_id, scope, coalesce(ad_account_id, ''), coalesce(proposal_id::text, ''));
CREATE TABLE IF NOT EXISTS activity (
  id serial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kind text NOT NULL,
  summary text NOT NULL,
  detail jsonb,
  ok boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Messages from before conversations existed move into one first conversation per business.
INSERT INTO conversations (workspace_id, title, category)
  SELECT w.id, 'השיחה הראשונה', 'general' FROM workspaces w
  WHERE EXISTS (SELECT 1 FROM messages m WHERE m.workspace_id = w.id AND m.conversation_id IS NULL)
    AND NOT EXISTS (SELECT 1 FROM conversations c WHERE c.workspace_id = w.id);
UPDATE messages m SET conversation_id = (
  SELECT c.id FROM conversations c WHERE c.workspace_id = m.workspace_id ORDER BY c.created_at LIMIT 1
) WHERE m.conversation_id IS NULL;
`;
