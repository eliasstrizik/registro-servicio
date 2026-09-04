-- Transactional regression tests: all fixture users/data/settings roll back.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('92abfff1-7000-4000-8000-000000000001','access-test-admin@example.invalid',now(),false),
('92abfff1-7000-4000-8000-000000000002','access-test-operator@example.invalid',now(),false),
('92abfff1-7000-4000-8000-000000000003','access-test-denied@example.invalid',now(),false);
insert into private.service_access(email,role) values
('access-test-admin@example.invalid','admin'),('access-test-operator@example.invalid','technician');
update private.app_settings set value=encode(extensions.digest('test-only-password','sha256'),'hex') where key='admin_password_sha256';

set local role anon;
do $$ begin
  begin
    perform public.list_service_orders('test-only-password');
    raise exception 'TEST FAILED: anonymous access allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"92abfff1-7000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  assert public.get_my_service_profile()->>'role'='admin','admin profile';
  assert jsonb_typeof(public.list_service_orders()->'orders')='array','admin can read without password';
end $$;
select set_config('request.jwt.claims','{"sub":"92abfff1-7000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare result jsonb; order_id uuid; begin
  assert public.get_my_service_profile()->>'role'='technician','technician profile';
  assert public.list_service_orders() ? 'error','password required';
  assert public.list_service_orders('wrong') ? 'error','wrong password denied';
  assert jsonb_typeof(public.list_service_orders('test-only-password')->'orders')='array','shared password allowed';
  order_id:=public.submit_service_order_authenticated('REGRESSION-TRANSACTION-ONLY','2026-09-02','Test client','Test technician','Test model','Test only','[{"code":"001","quantity":2,"description":"Part A"},{"code":"002","quantity":1,"description":"Part B"}]'::jsonb);
  result:=public.list_service_orders('test-only-password');
  assert exists(select 1 from jsonb_array_elements(result->'orders') o where o->>'id'=order_id::text and jsonb_array_length(o->'parts')=2),'order/parts atomic insert';
  for i in 1..5 loop perform public.list_service_orders('wrong'); end loop;
  assert public.list_service_orders('test-only-password')->>'error' like 'Demasiados intentos.%','rate limit persists';
end $$;
select set_config('request.jwt.claims','{"sub":"92abfff1-7000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.list_service_orders('test-only-password');
    raise exception 'TEST FAILED: unlisted email allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update private.service_access set active=false where email='access-test-operator@example.invalid';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"92abfff1-7000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.get_my_service_profile();
    raise exception 'TEST FAILED: revoked email allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'PASS: anonymous, admin, operator password, rate limit, multi-part order, unlisted and revoked email' as test_result;
rollback;

