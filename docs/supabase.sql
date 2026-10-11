-- Unihockey Stars: Spielstand online speichern mit Code (z. B. UH-7K2P-QX9M)
-- Im Supabase-Dashboard unter «SQL Editor» → «New query» einfügen und mit «Run» ausführen.
-- Das Skript kann gefahrlos mehrmals ausgeführt werden. Es benutzt nur eigene Namen (uh_…)
-- und verändert die Netzroller-Tabellen nicht.
--
-- Sicherheitskonzept (gleiches Muster wie bei Netzroller):
--   * RLS ist aktiv und es gibt keine Policy: niemand kann die Tabelle direkt lesen oder schreiben.
--   * Lesen und Schreiben nur über die zwei Funktionen uh_load_game und uh_save_game
--     (SECURITY DEFINER), die den Code verlangen.
--   * In der Tabelle steht nur die SHA-256-Prüfsumme des Codes, nie der Code selbst.
--   * Code: «UH-» + 2 × 4 Zeichen aus 32 Zeichen (ohne 0/O und 1/I) → über eine Billion Möglichkeiten.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tabelle ----------
create table if not exists public.uh_savegames (
  code        text primary key check (code ~ '^[0-9a-f]{64}$'),   -- SHA-256 des Codes
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.uh_savegames enable row level security;
revoke all on public.uh_savegames from anon, authenticated;

-- ---------- Hilfsfunktion (nicht öffentlich) ----------
create or replace function public.uh_code_hash(p_code text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex')
$$;
revoke all on function public.uh_code_hash(text) from public, anon, authenticated;

create or replace function public.uh_code_ok(p_code text) returns boolean
language sql immutable set search_path = '' as $$
  select p_code is not null and upper(trim(p_code)) ~ '^UH-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'
$$;
revoke all on function public.uh_code_ok(text) from public, anon, authenticated;

-- ---------- 1. Laden ----------
-- p_meta_only = true: nur Zeitpunkte (um zu prüfen, ob ein anderes Gerät neuer ist), ohne die Daten.
create or replace function public.uh_load_game(p_code text, p_meta_only boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.uh_savegames;
begin
  if not uh_code_ok(p_code) then raise exception 'Code ungültig'; end if;
  select * into r from uh_savegames where code = uh_code_hash(p_code);
  if not found then return null; end if;
  if p_meta_only then
    return jsonb_build_object('updated_at', r.updated_at, 'saved_at', r.data->>'savedAt');
  end if;
  return jsonb_build_object('updated_at', r.updated_at, 'saved_at', r.data->>'savedAt', 'data', r.data);
end $$;

-- ---------- 2. Speichern ----------
-- p_known: Stand (updated_at), den dieses Gerät zuletzt kannte. Ist der Server neuer (anderes Gerät
-- hat inzwischen gespeichert), wird nicht überschrieben, sondern ein Konflikt gemeldet –
-- ausser p_force = true (der Spieler hat die Warnung bestätigt).
create or replace function public.uh_save_game(p_code text, p_data jsonb, p_known timestamptz default null, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  h   text;
  cur public.uh_savegames;
  ts  timestamptz := now();
begin
  if not uh_code_ok(p_code) then raise exception 'Code ungültig'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Daten ungültig'; end if;
  if pg_column_size(p_data) > 3000000 then raise exception 'Spielstand zu gross'; end if;
  h := uh_code_hash(p_code);
  select * into cur from uh_savegames where code = h for update;
  if found then
    if not p_force and (p_known is null or cur.updated_at > p_known + interval '1 second') then
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', cur.updated_at, 'saved_at', cur.data->>'savedAt');
    end if;
    if cur.updated_at > ts - interval '2 seconds' then raise exception 'Bitte kurz warten'; end if;
  end if;
  insert into uh_savegames (code, data, updated_at) values (h, p_data, ts)
  on conflict (code) do update set data = excluded.data, updated_at = excluded.updated_at;
  return jsonb_build_object('ok', true, 'updated_at', ts);
end $$;

revoke all on function public.uh_load_game(text, boolean) from public, authenticated;
revoke all on function public.uh_save_game(text, jsonb, timestamptz, boolean) from public, authenticated;
-- Absichtlich: Die zwei Funktionen laufen als SECURITY DEFINER und sind für «anon» aufrufbar.
-- Der Supabase-Sicherheitsberater warnt deshalb; der Schutz ist der Code, den jede Funktion verlangt.
grant execute on function public.uh_load_game(text, boolean) to anon;
grant execute on function public.uh_save_game(text, jsonb, timestamptz, boolean) to anon;
