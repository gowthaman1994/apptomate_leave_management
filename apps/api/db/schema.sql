-- Adapted from database-schema.md for plain PostgreSQL + FastAPI
-- (no Supabase Auth): auth.users -> public.users, auth.uid() -> public.current_user_id(),
-- RLS policies driven by a session variable ("app.user_id") set per-request by FastAPI
-- instead of Supabase's `authenticated` role / JWT claims.
-- pg_cron / pg_net scheduled jobs and Supabase Edge Functions are intentionally omitted;
-- they become FastAPI background tasks later.

CREATE TYPE public.app_role AS ENUM ('ADMIN','MANAGER','EMPLOYEE');
CREATE TYPE public.user_status AS ENUM ('ACTIVE','INACTIVE');
CREATE TYPE public.leave_status AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
CREATE TYPE public.holiday_type AS ENUM ('NATIONAL','FESTIVAL','COMPANY');

-- Replaces Supabase's auth.users. FastAPI owns authentication against this table directly.
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  employee_id TEXT UNIQUE,
  department TEXT,
  designation TEXT,
  joining_date DATE,
  reporting_manager_id UUID REFERENCES public.profiles(id),
  status public.user_status NOT NULL DEFAULT 'ACTIVE',
  leave_balance JSONB NOT NULL DEFAULT '{"CASUAL":12,"SICK":6,"EARNED":15,"OPTIONAL":2,"LOP":0}'::jsonb,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE public.leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  annual_quota NUMERIC NOT NULL DEFAULT 0,
  is_deductible BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days NUMERIC(4,1) NOT NULL,
  is_half_day BOOLEAN NOT NULL DEFAULT false,
  reason TEXT NOT NULL,
  status public.leave_status NOT NULL DEFAULT 'PENDING',
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL UNIQUE,
  type public.holiday_type NOT NULL DEFAULT 'COMPANY',
  is_optional BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reads the app.user_id session variable that FastAPI sets with `SET LOCAL app.user_id = '<uuid>'`
-- at the start of each request's transaction. Replaces Supabase's auth.uid().
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_setting text;
BEGIN
  v_setting := current_setting('app.user_id', true);
  IF v_setting IS NULL OR v_setting = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_setting::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Replaces Supabase's handle_new_user() trigger on auth.users: fires when FastAPI
-- inserts into public.users during registration, creating the profile and default role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, split_part(NEW.email, '@', 1), NEW.email);
  IF NEW.email = 'psgowthaman@apptomate.co' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'ADMIN');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'EMPLOYEE');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_user_created AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all active profiles" ON public.profiles FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "Admins can view all profiles including deleted" ON public.profiles FOR SELECT USING (public.has_role(public.current_user_id(),'ADMIN'));
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (public.current_user_id() = user_id);
CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT WITH CHECK (public.has_role(public.current_user_id(),'ADMIN'));
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING (public.has_role(public.current_user_id(),'ADMIN'));
CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE USING (public.has_role(public.current_user_id(),'ADMIN'));

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (user_id = public.current_user_id());
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(public.current_user_id(),'ADMIN'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(public.current_user_id(),'ADMIN'));

CREATE POLICY "Everyone can view leave types" ON public.leave_types FOR SELECT USING (true);
CREATE POLICY "Admins can manage leave types" ON public.leave_types FOR ALL USING (public.has_role(public.current_user_id(),'ADMIN'));

CREATE POLICY "Users can view their own leaves" ON public.leaves FOR SELECT USING (user_id = public.current_user_id());
CREATE POLICY "Managers can view team leaves" ON public.leaves FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = leaves.user_id
    AND profiles.reporting_manager_id = (SELECT id FROM public.profiles WHERE user_id = public.current_user_id())));
CREATE POLICY "Admins can view all leaves" ON public.leaves FOR SELECT USING (public.has_role(public.current_user_id(),'ADMIN'));
CREATE POLICY "Users can create their own leaves" ON public.leaves FOR INSERT WITH CHECK (user_id = public.current_user_id());
CREATE POLICY "Users can cancel their own pending leaves" ON public.leaves FOR UPDATE
  USING (user_id = public.current_user_id() AND status = 'PENDING') WITH CHECK (user_id = public.current_user_id() AND status = 'CANCELLED');
CREATE POLICY "Managers can update team leaves" ON public.leaves FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = leaves.user_id
    AND profiles.reporting_manager_id = (SELECT id FROM public.profiles WHERE user_id = public.current_user_id())));
CREATE POLICY "Admins can manage all leaves" ON public.leaves FOR ALL USING (public.has_role(public.current_user_id(),'ADMIN'));

CREATE POLICY "Everyone can view holidays" ON public.holidays FOR SELECT USING (true);
CREATE POLICY "Admins can manage holidays" ON public.holidays FOR ALL USING (public.has_role(public.current_user_id(),'ADMIN'));

INSERT INTO public.leave_types (name, code, annual_quota, is_deductible) VALUES
  ('Casual Leave','CASUAL',12,true),
  ('Sick Leave','SICK',6,true),
  ('Earned Leave','EARNED',15,true),
  ('Optional Leave','OPTIONAL',2,true),
  ('Loss of Pay','LOP',0,false)
ON CONFLICT (code) DO NOTHING;

-- app_user is the role FastAPI connects as; it is not the owner of these objects,
-- so RLS policies above actually apply to its connections (table owners bypass RLS).
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;
