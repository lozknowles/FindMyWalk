CREATE TABLE IF NOT EXISTS route_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 route_id uuid REFERENCES walks(id) ON DELETE SET NULL,
 reason text NOT NULL CHECK (reason IN ('safety','inappropriate','privacy','other')),
 details varchar(1000) NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 resolution text
);
CREATE INDEX IF NOT EXISTS route_reports_open ON route_reports(created_at DESC) WHERE reviewed_at IS NULL;
