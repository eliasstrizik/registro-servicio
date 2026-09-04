begin;

-- Five fixed application ranks. Existing operators keep equivalent access as technicians.
alter table private.service_access drop constraint if exists service_access_role_check;
update private.service_access set role='technician' where role='operator';
alter table private.service_access add constraint service_access_role_check
  check (role in ('user','technician','supervisor','sub_admin','admin'));

alter table private.service_access_audit drop constraint if exists service_access_audit_action_check;
alter table private.service_access_audit add constraint service_access_audit_action_check
  check (action in ('add','activate','deactivate','role_change'));
alter table private.service_access_audit add column if not exists details jsonb not null default '{}'::jsonb;

create table if not exists private.service_order_deletions (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_email text not null,
  order_id uuid not null,
  order_snapshot jsonb not null
);
alter table private.service_order_deletions enable row level security;
revoke all on private.service_order_deletions from public,anon,authenticated;

create or replace function private.service_role_level(p_role text)
returns integer language sql immutable security invoker set search_path='' as $$
  select case p_role when 'admin' then 5 when 'sub_admin' then 4
    when 'supervisor' then 3 when 'technician' then 2 when 'user' then 1 else 0 end
$$;
revoke all on function private.service_role_level(text) from public,anon,authenticated;

drop function if exists public.manage_service_users(text,text,text,boolean);
drop function if exists private.manage_service_users(text,text,text,boolean);
create function private.manage_service_users(
  p_password text,p_action text default 'list',p_email text default null,
  p_active boolean default null,p_role text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_profile jsonb; v_hash text; v_failures integer; v_actor_level integer;
  v_email text:=lower(trim(p_email)); v_target private.service_access%rowtype;
  v_new_role text:=lower(trim(p_role)); v_target_level integer;
begin
  v_profile:=private.service_profile();
  v_actor_level:=private.service_role_level(v_profile->>'role');
  if v_actor_level < 3 then raise exception 'Tu rango no permite gestionar usuarios.' using errcode='42501'; end if;
  if coalesce(p_password,'')='' then return jsonb_build_object('error','Ingresá la contraseña de órdenes registradas.'); end if;
  insert into private.service_password_attempts(user_id) values(auth.uid()) on conflict do nothing;
  perform 1 from private.service_password_attempts where user_id=auth.uid() for update;
  update private.service_password_attempts set window_start=now(),failures=0 where user_id=auth.uid() and window_start<=now()-interval '15 minutes';
  select failures into v_failures from private.service_password_attempts where user_id=auth.uid();
  if v_failures>=5 then return jsonb_build_object('error','Demasiados intentos. Esperá 15 minutos para reintentar.'); end if;
  select value into v_hash from private.app_settings where key='admin_password_sha256';
  if v_hash is null or encode(extensions.digest(p_password,'sha256'),'hex')<>v_hash then
    update private.service_password_attempts set failures=failures+1 where user_id=auth.uid();
    return jsonb_build_object('error','Clave incorrecta.');
  end if;
  update private.service_password_attempts set failures=0 where user_id=auth.uid();
  if p_action is null or p_action not in ('list','add','set_active','set_role') then return jsonb_build_object('error','Acción inválida.'); end if;
  if p_action<>'list' then
    if v_email is null or length(v_email)>254 or v_email!~'^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' then return jsonb_build_object('error','Ingresá un correo válido.'); end if;
    perform pg_advisory_xact_lock(hashtextextended('service-user:'||v_email,0));
    select * into v_target from private.service_access where email=v_email for update;
    if v_target.email=v_profile->>'email' or v_target.role='admin' then return jsonb_build_object('error','Esa cuenta está protegida y no puede modificarse.'); end if;
    if p_action='add' then
      if v_target.email is not null then return jsonb_build_object('error','El correo ya está registrado. Podés editarlo desde la lista.'); end if;
      if v_new_role not in ('user','technician','supervisor','sub_admin') or private.service_role_level(v_new_role)>=v_actor_level then return jsonb_build_object('error','Solo podés asignar un rango inferior al tuyo.'); end if;
      insert into private.service_access(email,role,active) values(v_email,v_new_role,true);
      insert into private.service_access_audit(actor_email,target_email,action,details) values(v_profile->>'email',v_email,'add',jsonb_build_object('role',v_new_role));
    else
      if v_target.email is null then return jsonb_build_object('error','Usuario inexistente.'); end if;
      v_target_level:=private.service_role_level(v_target.role);
      if v_target_level>=v_actor_level then return jsonb_build_object('error','Solo podés modificar usuarios de rango inferior al tuyo.'); end if;
      if p_action='set_active' then
        if p_active is null then return jsonb_build_object('error','Estado inválido.'); end if;
        if v_target.active is distinct from p_active then
          update private.service_access set active=p_active where email=v_email;
          insert into private.service_access_audit(actor_email,target_email,action,details) values(v_profile->>'email',v_email,case when p_active then 'activate' else 'deactivate' end,jsonb_build_object('role',v_target.role));
        end if;
      else
        if v_new_role not in ('user','technician','supervisor','sub_admin') or private.service_role_level(v_new_role)>=v_actor_level then return jsonb_build_object('error','Solo podés asignar un rango inferior al tuyo.'); end if;
        update private.service_access set role=v_new_role where email=v_email;
        insert into private.service_access_audit(actor_email,target_email,action,details) values(v_profile->>'email',v_email,'role_change',jsonb_build_object('from',v_target.role,'to',v_new_role));
      end if;
    end if;
  end if;
  return jsonb_build_object('users',coalesce((select jsonb_agg(jsonb_build_object('email',email,'role',role,'active',active,'created_at',created_at) order by private.service_role_level(role) desc,email) from private.service_access where email=v_profile->>'email' or private.service_role_level(role)<v_actor_level),'[]'::jsonb));
end $$;

create function public.manage_service_users(p_password text,p_action text default 'list',p_email text default null,p_active boolean default null,p_role text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.manage_service_users(p_password,p_action,p_email,p_active,p_role) $$;
revoke all on function private.manage_service_users(text,text,text,boolean,text),public.manage_service_users(text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function private.manage_service_users(text,text,text,boolean,text),public.manage_service_users(text,text,text,boolean,text) to authenticated;

create or replace function private.delete_service_order(p_order_id uuid,p_password text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile jsonb;v_hash text;v_failures integer;v_snapshot jsonb;
begin
  v_profile:=private.service_profile();
  if private.service_role_level(v_profile->>'role')<3 then raise exception 'Tu rango no permite eliminar órdenes.' using errcode='42501'; end if;
  if coalesce(p_password,'')='' then return jsonb_build_object('error','Ingresá la contraseña de órdenes registradas.'); end if;
  insert into private.service_password_attempts(user_id) values(auth.uid()) on conflict do nothing;
  perform 1 from private.service_password_attempts where user_id=auth.uid() for update;
  update private.service_password_attempts set window_start=now(),failures=0 where user_id=auth.uid() and window_start<=now()-interval '15 minutes';
  select failures into v_failures from private.service_password_attempts where user_id=auth.uid();
  if v_failures>=5 then return jsonb_build_object('error','Demasiados intentos. Esperá 15 minutos para reintentar.'); end if;
  select value into v_hash from private.app_settings where key='admin_password_sha256';
  if v_hash is null or encode(extensions.digest(p_password,'sha256'),'hex')<>v_hash then update private.service_password_attempts set failures=failures+1 where user_id=auth.uid();return jsonb_build_object('error','Clave incorrecta.');end if;
  update private.service_password_attempts set failures=0 where user_id=auth.uid();
  select to_jsonb(o)||jsonb_build_object('parts',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.spare_parts p where p.order_id=o.id),'[]'::jsonb)) into v_snapshot from public.service_orders o where o.id=p_order_id for update;
  if v_snapshot is null then return jsonb_build_object('error','La orden ya no existe.'); end if;
  insert into private.service_order_deletions(actor_email,order_id,order_snapshot) values(v_profile->>'email',p_order_id,v_snapshot);
  delete from public.service_orders where id=p_order_id;
  return jsonb_build_object('deleted',true,'order_id',p_order_id);
end $$;
create or replace function public.delete_service_order(p_order_id uuid,p_password text) returns jsonb language sql security invoker set search_path='' as $$select private.delete_service_order(p_order_id,p_password)$$;
revoke all on function private.delete_service_order(uuid,text),public.delete_service_order(uuid,text) from public,anon,authenticated;
grant execute on function private.delete_service_order(uuid,text),public.delete_service_order(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;

