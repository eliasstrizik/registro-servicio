begin;

-- Private audit trail; no client may read/write it directly.
create table private.service_access_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_email text not null,
  target_email text not null,
  action text not null check (action in ('add','activate','deactivate'))
);
alter table private.service_access_audit enable row level security;
revoke all on private.service_access_audit from public, anon, authenticated;

create or replace function private.manage_service_users(
  p_password text, p_action text default 'list',
  p_email text default null, p_active boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_profile jsonb; v_hash text; v_failures integer;
  v_email text := lower(trim(p_email)); v_target private.service_access%rowtype;
begin
  -- Password possession alone never grants permission to manage access.
  v_profile := private.service_profile();
  if v_profile->>'role' <> 'admin' then
    raise exception 'Solo el administrador puede gestionar usuarios.' using errcode='42501';
  end if;
  if coalesce(p_password,'') = '' then
    return jsonb_build_object('error','Ingresá la contraseña de órdenes registradas.');
  end if;
  insert into private.service_password_attempts(user_id) values(auth.uid()) on conflict do nothing;
  perform 1 from private.service_password_attempts where user_id=auth.uid() for update;
  update private.service_password_attempts set window_start=now(),failures=0
    where user_id=auth.uid() and window_start<=now()-interval '15 minutes';
  select failures into v_failures from private.service_password_attempts where user_id=auth.uid();
  if v_failures>=5 then
    return jsonb_build_object('error','Demasiados intentos. Esperá 15 minutos para reintentar.');
  end if;
  select value into v_hash from private.app_settings where key='admin_password_sha256';
  if v_hash is null or encode(extensions.digest(p_password,'sha256'),'hex')<>v_hash then
    update private.service_password_attempts set failures=failures+1 where user_id=auth.uid();
    return jsonb_build_object('error','Clave incorrecta.');
  end if;
  update private.service_password_attempts set failures=0 where user_id=auth.uid();

  if p_action is null or p_action not in ('list','add','set_active') then
    return jsonb_build_object('error','Acción inválida.');
  end if;
  if p_action<>'list' then
    if v_email is null or length(v_email)>254
      or v_email !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' then
      return jsonb_build_object('error','Ingresá un correo válido.');
    end if;
    -- Serialize changes and protect existing administrator rows from this UI.
    perform pg_advisory_xact_lock(hashtextextended('service-user:'||v_email,0));
    select * into v_target from private.service_access where email=v_email for update;
    if v_target.role='admin' then
      return jsonb_build_object('error','El administrador está protegido y no se modifica desde esta sección.');
    end if;
    if p_action='add' then
      if v_target.email is not null then
        return jsonb_build_object('error','El correo ya está registrado. Podés activarlo desde la lista.');
      end if;
      insert into private.service_access(email,role,active) values(v_email,'operator',true);
      insert into private.service_access_audit(actor_email,target_email,action)
        values(v_profile->>'email',v_email,'add');
    else
      if v_target.email is null or p_active is null then
        return jsonb_build_object('error','Usuario o estado inválido.');
      end if;
      if v_target.active is distinct from p_active then
        update private.service_access set active=p_active where email=v_email;
        insert into private.service_access_audit(actor_email,target_email,action)
          values(v_profile->>'email',v_email,case when p_active then 'activate' else 'deactivate' end);
      end if;
    end if;
  end if;
  return jsonb_build_object('users',coalesce((
    select jsonb_agg(jsonb_build_object('email',email,'role',role,'active',active,'created_at',created_at)
      order by role,email) from private.service_access
  ),'[]'::jsonb));
end $$;

create or replace function public.manage_service_users(
  p_password text, p_action text default 'list', p_email text default null, p_active boolean default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.manage_service_users(p_password,p_action,p_email,p_active)
$$;
revoke all on function private.manage_service_users(text,text,text,boolean),public.manage_service_users(text,text,text,boolean) from public,anon,authenticated;
grant execute on function private.manage_service_users(text,text,text,boolean),public.manage_service_users(text,text,text,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;

