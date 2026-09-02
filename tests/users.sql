-- All fixture accounts, allowlist changes, settings and audit entries roll back.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('92abfff1-7100-4000-8000-000000000001','users-test-admin@example.invalid',now(),false),
('92abfff1-7100-4000-8000-000000000002','users-test-operator@example.invalid',now(),false);
insert into private.service_access(email,role) values
('users-test-admin@example.invalid','admin'),('users-test-operator@example.invalid','operator');
update private.app_settings set value=encode(extensions.digest('test-only-password','sha256'),'hex') where key='admin_password_sha256';
set local role anon;
do $$ begin
  begin
    perform public.manage_service_users('test-only-password');
    raise exception 'TEST FAILED: anonymous access allowed';
  exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"92abfff1-7100-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.manage_service_users('test-only-password','add','users-test-illegal@example.invalid');
    raise exception 'TEST FAILED: operator can manage users';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"92abfff1-7100-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare result jsonb; begin
  assert public.manage_service_users(null) ? 'error','admin requires password';
  assert public.manage_service_users('wrong') ? 'error','wrong password denied';
  result:=public.manage_service_users('test-only-password');
  assert jsonb_typeof(result->'users')='array','correct password lists users';
  assert public.manage_service_users('test-only-password','add','invalid') ? 'error','invalid email rejected';
  result:=public.manage_service_users('test-only-password','add',' USERS-TEST-NEW@EXAMPLE.INVALID ');
  assert exists(select 1 from jsonb_array_elements(result->'users') u where u->>'email'='users-test-new@example.invalid' and u->>'role'='operator' and (u->>'active')::boolean),'normalized operator added';
  assert public.manage_service_users('test-only-password','add','users-test-new@example.invalid') ? 'error','duplicate rejected';
  result:=public.manage_service_users('test-only-password','set_active','users-test-new@example.invalid',false);
  assert exists(select 1 from jsonb_array_elements(result->'users') u where u->>'email'='users-test-new@example.invalid' and not (u->>'active')::boolean),'operator deactivated';
  result:=public.manage_service_users('test-only-password','set_active','users-test-new@example.invalid',true);
  assert exists(select 1 from jsonb_array_elements(result->'users') u where u->>'email'='users-test-new@example.invalid' and (u->>'active')::boolean),'operator reactivated';
  assert public.manage_service_users('test-only-password','set_active','users-test-admin@example.invalid',false) ? 'error','administrator protected';
  assert public.manage_service_users('test-only-password','add','users-test-admin@example.invalid') ? 'error','administrator cannot be overwritten';
  assert public.manage_service_users('test-only-password','promote','users-test-new@example.invalid') ? 'error','no privilege escalation action';
  for i in 1..5 loop perform public.manage_service_users('wrong'); end loop;
  assert public.manage_service_users('test-only-password')->>'error' like 'Demasiados intentos.%','rate limit persists';
end $$;
reset role;
do $$ begin
  assert (select count(*) from private.service_access_audit where target_email='users-test-new@example.invalid')=3,'audit for add and toggles';
  assert not exists(select 1 from private.service_access where email='users-test-illegal@example.invalid'),'operator cannot insert';
end $$;
update private.service_access set active=false where email='users-test-admin@example.invalid';
set local role authenticated;
do $$ begin
  begin
    perform public.manage_service_users('test-only-password');
    raise exception 'TEST FAILED: revoked admin can access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: administrator + password, anon/operator denial, add/toggle, protected admin, rate limit, audit, live revocation' as test_result;
rollback;

