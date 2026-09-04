begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('92abfff1-7200-4000-8000-000000000001','roles-admin@example.invalid',now(),false),
('92abfff1-7200-4000-8000-000000000002','roles-supervisor@example.invalid',now(),false),
('92abfff1-7200-4000-8000-000000000003','roles-user@example.invalid',now(),false);
insert into private.service_access(email,role) values
('roles-admin@example.invalid','admin'),('roles-supervisor@example.invalid','supervisor'),('roles-user@example.invalid','user');
update private.app_settings set value=encode(extensions.digest('test-only-password','sha256'),'hex') where key='admin_password_sha256';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"92abfff1-7200-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare result jsonb; order_id uuid; begin
  result:=public.manage_service_users('test-only-password');
  assert not exists(select 1 from jsonb_array_elements(result->'users') u where u->>'role'='admin'),'supervisor cannot see admin';
  assert public.manage_service_users('test-only-password','add','roles-illegal@example.invalid',null,'sub_admin') ? 'error','supervisor cannot assign higher role';
  assert public.manage_service_users('test-only-password','set_active','roles-admin@example.invalid',false) ? 'error','supervisor cannot edit admin';
  order_id:=public.submit_service_order_authenticated('ROLES-DELETE-TEST','2026-09-04','Client','Tech','Model','','[{"code":"1","quantity":1,"description":"Part"}]');
  assert public.delete_service_order(order_id,'wrong') ? 'error','delete requires password';
  assert (public.delete_service_order(order_id,'test-only-password')->>'deleted')::boolean,'supervisor deletes order';
  assert public.delete_service_order(order_id,'test-only-password') ? 'error','deleted order no longer exists';
end $$;
select set_config('request.jwt.claims','{"sub":"92abfff1-7200-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  begin perform public.manage_service_users('test-only-password');raise exception 'TEST FAILED: user managed access';exception when insufficient_privilege then null;end;
  begin perform public.delete_service_order(gen_random_uuid(),'test-only-password');raise exception 'TEST FAILED: user deleted order';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
  assert exists(select 1 from private.service_order_deletions where order_snapshot->>'order_number'='ROLES-DELETE-TEST' and jsonb_array_length(order_snapshot->'parts')=1),'deletion snapshot retained';
end $$;
rollback;

