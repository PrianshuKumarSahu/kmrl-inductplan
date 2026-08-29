-- ============================================================
-- KMRL Train Induction Planning Platform — Supabase Schema
-- Apply this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ────────────────────────────────────────────────────────────
-- PROFILES (extends Supabase Auth users)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name         TEXT NOT NULL,
  employee_id  TEXT UNIQUE NOT NULL,
  department   TEXT,
  role         TEXT NOT NULL DEFAULT 'read_only'
                 CHECK (role IN ('supervisor','operator','read_only')),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- TRAINSETS (25 four-car rakes, expandable to 40)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trainsets (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number                    TEXT UNIQUE NOT NULL,        -- e.g. "KM-01"
  name                      TEXT,                        -- optional display name
  total_mileage_km          DECIMAL(10,2) NOT NULL DEFAULT 0,
  current_bay_position      TEXT,                        -- e.g. "IBL-A1"
  last_cleaned_at           TIMESTAMPTZ,
  last_deep_cleaned_at      TIMESTAMPTZ,
  status                    TEXT NOT NULL DEFAULT 'ready'
                              CHECK (status IN ('ready','maintenance','standby','inspection')),
  -- Fitness Certificates
  cert_rs_valid_until       DATE,
  cert_signalling_valid_until DATE,
  cert_telecom_valid_until  DATE,
  -- Metadata
  year_of_manufacture       INTEGER,
  manufacturer              TEXT DEFAULT 'BEML',
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- JOB CARDS (IBM Maximo work orders)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainset_id   UUID REFERENCES trainsets(id) ON DELETE CASCADE,
  maximo_ref    TEXT,                                   -- Maximo WO number
  description   TEXT NOT NULL,
  category      TEXT,                                   -- e.g. "Electrical","Mechanical"
  priority      TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('critical','high','normal','low')),
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','closed','cancelled')),
  raised_by     TEXT,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  estimated_hours DECIMAL(6,2),
  actual_hours    DECIMAL(6,2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- BRANDING CONTRACTS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branding_contracts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainset_id                 UUID REFERENCES trainsets(id) ON DELETE SET NULL,
  advertiser_name             TEXT NOT NULL,
  campaign_name               TEXT,
  required_hours_per_week     DECIMAL(6,2) NOT NULL DEFAULT 0,
  actual_hours_this_week      DECIMAL(6,2) NOT NULL DEFAULT 0,
  total_hours_served          DECIMAL(8,2) NOT NULL DEFAULT 0,
  contract_start              DATE NOT NULL,
  contract_end                DATE NOT NULL,
  priority_score              INTEGER NOT NULL DEFAULT 5 CHECK (priority_score BETWEEN 1 AND 10),
  penalty_per_hour_missed     DECIMAL(10,2) DEFAULT 0,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- MILEAGE LOGS (daily km records per trainset)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mileage_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainset_id     UUID REFERENCES trainsets(id) ON DELETE CASCADE,
  log_date        DATE NOT NULL,
  km_added        DECIMAL(8,2) NOT NULL CHECK (km_added >= 0),
  cumulative_km   DECIMAL(10,2) NOT NULL,
  service_slot    TEXT,                               -- e.g. "Morning Peak"
  recorded_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trainset_id, log_date)
);

-- ────────────────────────────────────────────────────────────
-- CLEANING SLOTS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cleaning_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainset_id     UUID REFERENCES trainsets(id) ON DELETE CASCADE,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  cleaning_type   TEXT NOT NULL DEFAULT 'interior'
                    CHECK (cleaning_type IN ('interior','exterior','deep_clean','sanitisation')),
  bay             TEXT,
  assigned_crew   TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','in_progress','done','cancelled')),
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- GENERATED SCHEDULES (nightly induction plan output)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_date         DATE UNIQUE NOT NULL,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  optimization_params   JSONB NOT NULL DEFAULT '{}',
  induction_list        JSONB NOT NULL DEFAULT '[]',
                        -- Array of { trainset_id, number, rank, score, inducted,
                        --            explanation, slot, conflicts }
  conflicts             JSONB NOT NULL DEFAULT '[]',
  total_inducted        INTEGER NOT NULL DEFAULT 0,
  solver_time_ms        INTEGER,
  is_final              BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- MAINTENANCE EVENTS (actual unscheduled maintenance)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainset_id     UUID REFERENCES trainsets(id) ON DELETE CASCADE,
  event_date      DATE NOT NULL,
  event_type      TEXT NOT NULL,    -- "unscheduled","scheduled","inspection"
  description     TEXT,
  downtime_hours  DECIMAL(6,2),
  cost_inr        DECIMAL(12,2),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- ML MODEL REGISTRY
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ml_models (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name      TEXT NOT NULL,
  model_type      TEXT NOT NULL,    -- "maintenance_risk","mileage_demand"
  version         TEXT NOT NULL,
  accuracy        DECIMAL(5,4),
  f1_score        DECIMAL(5,4),
  training_samples INTEGER,
  artifact_url    TEXT,             -- Supabase Storage path
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  trained_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- AUDIT LOGS (every action by every user)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name       TEXT,
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  before_state    JSONB,
  after_state     JSONB,
  ip_address      TEXT,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- INDEXES
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_job_cards_trainset ON job_cards(trainset_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_status ON job_cards(status);
CREATE INDEX IF NOT EXISTS idx_mileage_logs_trainset ON mileage_logs(trainset_id);
CREATE INDEX IF NOT EXISTS idx_mileage_logs_date ON mileage_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_events_trainset ON maintenance_events(trainset_id);

-- ────────────────────────────────────────────────────────────
-- TRIGGERS: auto-update updated_at
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_trainsets_updated_at ON trainsets;
CREATE TRIGGER trg_trainsets_updated_at BEFORE UPDATE ON trainsets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_job_cards_updated_at ON job_cards;
CREATE TRIGGER trg_job_cards_updated_at BEFORE UPDATE ON job_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_branding_updated_at ON branding_contracts;
CREATE TRIGGER trg_branding_updated_at BEFORE UPDATE ON branding_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- TRIGGER: auto-create profile on signup
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, employee_id, department, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New Employee'),
    COALESCE(NEW.raw_user_meta_data->>'employee_id', 'EMP-' || substr(NEW.id::text,1,6)),
    COALESCE(NEW.raw_user_meta_data->>'department', 'Operations'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'read_only')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE branding_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mileage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- PROFILES policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Supervisors can view all profiles" ON profiles
  FOR SELECT USING (current_user_role() = 'supervisor');
CREATE POLICY "Supervisors can update all profiles" ON profiles
  FOR UPDATE USING (current_user_role() = 'supervisor');

-- TRAINSETS policies (read: all auth; write: supervisor/operator)
CREATE POLICY "Authenticated users can read trainsets" ON trainsets
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Operators and supervisors can insert trainsets" ON trainsets
  FOR INSERT WITH CHECK (current_user_role() IN ('supervisor','operator'));
CREATE POLICY "Operators and supervisors can update trainsets" ON trainsets
  FOR UPDATE USING (current_user_role() IN ('supervisor','operator'));
CREATE POLICY "Only supervisors can delete trainsets" ON trainsets
  FOR DELETE USING (current_user_role() = 'supervisor');

-- JOB CARDS policies
CREATE POLICY "Authenticated users can read job cards" ON job_cards
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Operators and supervisors can manage job cards" ON job_cards
  FOR ALL USING (current_user_role() IN ('supervisor','operator'));

-- BRANDING policies
CREATE POLICY "Authenticated users can read branding" ON branding_contracts
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Operators and supervisors can manage branding" ON branding_contracts
  FOR ALL USING (current_user_role() IN ('supervisor','operator'));

-- MILEAGE LOGS policies
CREATE POLICY "Authenticated users can read mileage" ON mileage_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Operators and supervisors can manage mileage" ON mileage_logs
  FOR ALL USING (current_user_role() IN ('supervisor','operator'));

-- CLEANING SLOTS policies
CREATE POLICY "Authenticated users can read cleaning slots" ON cleaning_slots
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Operators and supervisors can manage cleaning" ON cleaning_slots
  FOR ALL USING (current_user_role() IN ('supervisor','operator'));

-- SCHEDULES policies
CREATE POLICY "Authenticated users can read schedules" ON schedules
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Supervisors can manage schedules" ON schedules
  FOR ALL USING (current_user_role() = 'supervisor');

-- MAINTENANCE EVENTS policies
CREATE POLICY "Authenticated users can read maintenance events" ON maintenance_events
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Operators and supervisors can manage maintenance" ON maintenance_events
  FOR ALL USING (current_user_role() IN ('supervisor','operator'));

-- ML MODELS policies
CREATE POLICY "Authenticated users can read ml models" ON ml_models
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Supervisors can manage ml models" ON ml_models
  FOR ALL USING (current_user_role() = 'supervisor');

-- AUDIT LOGS policies (read-only for supervisors, insert from service role)
CREATE POLICY "Supervisors can read audit logs" ON audit_logs
  FOR SELECT USING (current_user_role() = 'supervisor');
CREATE POLICY "All authenticated can view own audit actions" ON audit_logs
  FOR SELECT USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- SEED DATA: 25 Kochi Metro Trainsets
-- ────────────────────────────────────────────────────────────
INSERT INTO trainsets (number, name, total_mileage_km, current_bay_position,
  last_cleaned_at, last_deep_cleaned_at, status,
  cert_rs_valid_until, cert_signalling_valid_until, cert_telecom_valid_until,
  year_of_manufacture, manufacturer)
VALUES
  ('KM-01','Aluva Express',     142500.50,'IBL-A1', NOW()-INTERVAL'2 days', NOW()-INTERVAL'15 days','ready',  CURRENT_DATE+30, CURRENT_DATE+45, CURRENT_DATE+20, 2012,'BEML'),
  ('KM-02','Edappally Runner',  138200.75,'IBL-A2', NOW()-INTERVAL'1 day',  NOW()-INTERVAL'20 days','ready',  CURRENT_DATE+60, CURRENT_DATE+30, CURRENT_DATE+55, 2012,'BEML'),
  ('KM-03','Kaloor Sprinter',   155000.00,'IBL-A3', NOW()-INTERVAL'3 days', NOW()-INTERVAL'10 days','ready',  CURRENT_DATE+15, CURRENT_DATE+25, CURRENT_DATE+40, 2013,'BEML'),
  ('KM-04','Ernakulam South',   121000.25,'IBL-A4', NOW()-INTERVAL'1 day',  NOW()-INTERVAL'5 days', 'ready',  CURRENT_DATE+90, CURRENT_DATE+85, CURRENT_DATE+70, 2013,'BEML'),
  ('KM-05','Maharajas Flyer',   167800.00,'IBL-B1', NOW()-INTERVAL'4 days', NOW()-INTERVAL'25 days','ready',  CURRENT_DATE+10, CURRENT_DATE+20, CURRENT_DATE+8,  2013,'BEML'),
  ('KM-06','Palarivattom Star', 134500.50,'IBL-B2', NOW()-INTERVAL'1 day',  NOW()-INTERVAL'12 days','ready',  CURRENT_DATE+45, CURRENT_DATE+50, CURRENT_DATE+35, 2014,'BEML'),
  ('KM-07','JLN Stadium Metro', 148900.75,'IBL-B3', NOW()-INTERVAL'2 days', NOW()-INTERVAL'8 days', 'standby',CURRENT_DATE+55, CURRENT_DATE+60, CURRENT_DATE+48, 2014,'BEML'),
  ('KM-08','Lisie Connector',   112000.00,'IBL-B4', NOW()-INTERVAL'6 days', NOW()-INTERVAL'30 days','ready',  CURRENT_DATE+3,  CURRENT_DATE+40, CURRENT_DATE+25, 2014,'BEML'),
  ('KM-09','MG Road Express',   175200.25,'IBL-C1', NOW()-INTERVAL'1 day',  NOW()-INTERVAL'7 days', 'maintenance',CURRENT_DATE-2, CURRENT_DATE+35, CURRENT_DATE+30, 2015,'BEML'),
  ('KM-10','Ernakulam North',   129400.50,'IBL-C2', NOW()-INTERVAL'2 days', NOW()-INTERVAL'18 days','ready',  CURRENT_DATE+70, CURRENT_DATE+65, CURRENT_DATE+60, 2015,'BEML'),
  ('KM-11','Companypady Metro', 143700.00,'IBL-C3', NOW()-INTERVAL'1 day',  NOW()-INTERVAL'9 days', 'ready',  CURRENT_DATE+25, CURRENT_DATE+30, CURRENT_DATE+22, 2015,'BEML'),
  ('KM-12','Ambattukavu Link',  136800.75,'IBL-C4', NOW()-INTERVAL'3 days', NOW()-INTERVAL'22 days','ready',  CURRENT_DATE+35, CURRENT_DATE+40, CURRENT_DATE+28, 2016,'BEML'),
  ('KM-13','Thrikkakara Dash',  158600.00,'IBL-D1', NOW()-INTERVAL'1 day',  NOW()-INTERVAL'11 days','ready',  CURRENT_DATE+80, CURRENT_DATE+75, CURRENT_DATE+65, 2016,'BEML'),
  ('KM-14','Pynadath Flyer',    119500.25,'IBL-D2', NOW()-INTERVAL'5 days', NOW()-INTERVAL'35 days','standby',CURRENT_DATE+50, CURRENT_DATE+55, CURRENT_DATE+42, 2016,'BEML'),
  ('KM-15','Kalamassery Star',  161200.50,'IBL-D3', NOW()-INTERVAL'2 days', NOW()-INTERVAL'6 days', 'ready',  CURRENT_DATE+20, CURRENT_DATE+28, CURRENT_DATE+18, 2017,'BEML'),
  ('KM-16','Cusat Campus',      127300.75,'IBL-D4', NOW()-INTERVAL'1 day',  NOW()-INTERVAL'14 days','ready',  CURRENT_DATE+65, CURRENT_DATE+70, CURRENT_DATE+58, 2017,'BEML'),
  ('KM-17','Pathadipalam Metro',144800.00,'IBL-E1', NOW()-INTERVAL'3 days', NOW()-INTERVAL'16 days','ready',  CURRENT_DATE+40, CURRENT_DATE+45, CURRENT_DATE+33, 2017,'BEML'),
  ('KM-18','Eloor Express',     132100.25,'IBL-E2', NOW()-INTERVAL'2 days', NOW()-INTERVAL'20 days','ready',  CURRENT_DATE+75, CURRENT_DATE+80, CURRENT_DATE+68, 2018,'BEML'),
  ('KM-19','Angamaly Runner',   154700.50,'IBL-E3', NOW()-INTERVAL'1 day',  NOW()-INTERVAL'4 days', 'inspection',CURRENT_DATE+5, CURRENT_DATE+10, CURRENT_DATE+2, 2018,'BEML'),
  ('KM-20','Nedumbassery Link', 118900.75,'IBL-E4', NOW()-INTERVAL'4 days', NOW()-INTERVAL'28 days','ready',  CURRENT_DATE+85, CURRENT_DATE+90, CURRENT_DATE+72, 2018,'BEML'),
  ('KM-21','Thrikkariyoor Dash',147600.00,'IBL-F1', NOW()-INTERVAL'2 days', NOW()-INTERVAL'13 days','ready',  CURRENT_DATE+30, CURRENT_DATE+35, CURRENT_DATE+27, 2019,'BEML'),
  ('KM-22','Vyttila Hub Metro', 163400.25,'IBL-F2', NOW()-INTERVAL'1 day',  NOW()-INTERVAL'3 days', 'ready',  CURRENT_DATE+55, CURRENT_DATE+60, CURRENT_DATE+50, 2019,'BEML'),
  ('KM-23','Thevara Flyer',     126700.50,'IBL-F3', NOW()-INTERVAL'3 days', NOW()-INTERVAL'17 days','ready',  CURRENT_DATE+100,CURRENT_DATE+95, CURRENT_DATE+88, 2019,'BEML'),
  ('KM-24','Tripunithura Star', 140300.75,'IBL-F4', NOW()-INTERVAL'1 day',  NOW()-INTERVAL'8 days', 'ready',  CURRENT_DATE+45, CURRENT_DATE+50, CURRENT_DATE+38, 2020,'BEML'),
  ('KM-25','InfoPark Express',  152900.00,'IBL-G1', NOW()-INTERVAL'2 days', NOW()-INTERVAL'21 days','ready',  CURRENT_DATE+60, CURRENT_DATE+65, CURRENT_DATE+55, 2020,'BEML')
ON CONFLICT (number) DO NOTHING;

-- Sample branding contracts
INSERT INTO branding_contracts (trainset_id, advertiser_name, campaign_name,
  required_hours_per_week, actual_hours_this_week, total_hours_served,
  contract_start, contract_end, priority_score, penalty_per_hour_missed, is_active)
SELECT
  id, 'Kerala Tourism', 'Visit Kerala 2026', 40, 28, 1250, '2026-01-01', '2026-12-31', 9, 5000, true
FROM trainsets WHERE number = 'KM-01' ON CONFLICT DO NOTHING;

INSERT INTO branding_contracts (trainset_id, advertiser_name, campaign_name,
  required_hours_per_week, actual_hours_this_week, total_hours_served,
  contract_start, contract_end, priority_score, penalty_per_hour_missed, is_active)
SELECT
  id, 'FACT Fertilisers', 'FACT Brand 2026', 35, 35, 980, '2026-03-01', '2026-09-30', 7, 3000, true
FROM trainsets WHERE number = 'KM-05' ON CONFLICT DO NOTHING;

INSERT INTO branding_contracts (trainset_id, advertiser_name, campaign_name,
  required_hours_per_week, actual_hours_this_week, total_hours_served,
  contract_start, contract_end, priority_score, penalty_per_hour_missed, is_active)
SELECT
  id, 'Malabar Gold', 'Malabar Jewels 2026', 45, 38, 2100, '2026-01-15', '2027-01-14', 8, 8000, true
FROM trainsets WHERE number = 'KM-15' ON CONFLICT DO NOTHING;

-- Sample open job cards
INSERT INTO job_cards (trainset_id, maximo_ref, description, category, priority, status, opened_at)
SELECT id, 'WO-2026-4521', 'Pantograph inspection overdue', 'Electrical', 'high', 'open', NOW()-INTERVAL'2 days'
FROM trainsets WHERE number = 'KM-09' ON CONFLICT DO NOTHING;

INSERT INTO job_cards (trainset_id, maximo_ref, description, category, priority, status, opened_at)
SELECT id, 'WO-2026-4498', 'AC unit filter cleaning required', 'HVAC', 'normal', 'open', NOW()-INTERVAL'5 days'
FROM trainsets WHERE number = 'KM-14' ON CONFLICT DO NOTHING;

INSERT INTO job_cards (trainset_id, maximo_ref, description, category, priority, status, opened_at)
SELECT id, 'WO-2026-4489', 'Bogie wheel wear check', 'Mechanical', 'critical', 'open', NOW()-INTERVAL'1 day'
FROM trainsets WHERE number = 'KM-19' ON CONFLICT DO NOTHING;
