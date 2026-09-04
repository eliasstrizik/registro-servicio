import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/users.js',import.meta.url),'utf8');
const owner = {email:'admin@example.invalid',role:'admin'};
const fixture = [ {...owner,active:true}, {email:'operator@example.invalid',role:'technician',active:true} ];
function setup() {
  const nodes = new Map(), events = new Map(), calls = [];
  let handler = async () => ({data:{users:fixture},error:null});
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set(), handlers = new Map();
      nodes.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,handlers,open:false,
        classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,value)=>value?classes.add(x):classes.delete(x)},
        addEventListener:(name,fn)=>handlers.set(name,fn),
        replaceChildren(){this.innerHTML='';},querySelectorAll:()=>[],
        showModal(){this.open=true;},close(){this.open=false;}});
    }
    return nodes.get(id);
  }
  const context=vm.createContext({document:{getElementById:node},window:{
    addEventListener:(name,fn)=>events.set(name,fn),serviceAuth:{recheck(){},client:{rpc:async(name,args)=>{calls.push({name,args});return handler(name,args);}}}
  }});
  vm.runInContext(source,context);
  return {node,calls,login:profile=>events.get('service-auth')({detail:profile}),
    handler:fn=>{handler=fn;},
    fire:(id,event='submit',arg={preventDefault(){}})=>node(id).handlers.get(event)(arg),
    async unlock(){node('users-password').value='fixture-password';await node('users-gate').handlers.get('submit')({preventDefault(){}});}};
}
test('admin must unlock with orders password; list is not loaded on login',async()=>{
  const app=setup();app.login(owner);
  assert.equal(app.calls.length,0);
  assert.equal(app.node('tab-users').classList.contains('hidden'),false);
  assert.equal(app.node('users-dashboard').classList.contains('hidden'),true);
  await app.unlock();
  assert.equal(app.calls[0].args.p_password,'fixture-password');
  assert.equal(app.calls[0].name,'manage_service_users');
  assert.equal(app.node('users-password').value,'');
  assert.equal(app.node('users-dashboard').classList.contains('hidden'),false);
});
test('operators and signed-out users cannot use the Users section',async()=>{
  const app=setup();app.login({...owner,role:'operator'});await app.unlock();
  assert.equal(app.calls.length,0);assert.equal(app.node('tab-users').classList.contains('hidden'),true);
  app.login(null);await app.unlock();assert.equal(app.calls.length,0);
});
test('wrong password and server denials clear sensitive users',async()=>{
  const app=setup();app.login(owner);await app.unlock();
  app.handler(async()=>({data:{error:'Clave incorrecta.'},error:null}));
  await app.fire('refresh-users','click');
  assert.equal(app.node('users-list').innerHTML,'');assert.equal(app.node('users-dashboard').classList.contains('hidden'),true);
  assert.match(app.node('users-status').textContent,/Clave incorrecta/);
});
test('adding requires confirmation and sends the selected lower role',async()=>{
  const app=setup();app.login(owner);await app.unlock();
  app.node('new-user-email').value='NEW@EXAMPLE.INVALID';
  app.node('new-user-role').value='supervisor';
  app.fire('add-user-form');assert.equal(app.calls.length,1);assert.equal(app.node('user-confirm').open,true);
  await app.fire('user-confirm-form');
  assert.equal(app.calls[1].args.p_action,'add');assert.equal(app.calls[1].args.p_email,'new@example.invalid');
  assert.equal(app.calls[1].args.p_password,'fixture-password');assert.equal(app.calls[1].args.p_role,'supervisor');
});
test('deactivation requires confirmation; cancel makes no mutation',async()=>{
  const app=setup();app.login(owner);await app.unlock();
  const click={target:{closest:()=>({dataset:{activeEmail:'operator@example.invalid'}})}};
  app.fire('users-list','click',click);app.fire('user-confirm-cancel','click');
  await app.fire('user-confirm-form');assert.equal(app.calls.length,1);
  app.fire('users-list','click',click);await app.fire('user-confirm-form');
  assert.equal(app.calls[1].args.p_action,'set_active');assert.equal(app.calls[1].args.p_active,false);
});
test('logout, account switches and locks discard late responses',async()=>{
  const app=setup();app.login(owner);await app.unlock();
  let resolve;app.handler(()=>new Promise(r=>{resolve=r;}));
  const pending=app.fire('refresh-users','click');app.login(null);
  resolve({data:{users:fixture},error:null});await pending;
  assert.equal(app.node('users-list').innerHTML,'');assert.equal(app.node('users-dashboard').classList.contains('hidden'),true);
  app.handler(async()=>({data:{users:fixture},error:null}));app.login(owner);await app.unlock();
  app.fire('lock-users','click');assert.equal(app.node('users-list').innerHTML,'');
  app.node('users-password').value='';await app.fire('users-gate');assert.equal(app.calls.at(-1).args.p_password,'');
});
test('same-account refresh preserves unlock and safely escapes displayed email',async()=>{
  const app=setup();app.login(owner);
  app.handler(async()=>({data:{users:[{email:'<img>@example.invalid',role:'technician',active:true}]},error:null}));
  await app.unlock();app.login({...owner});
  assert.equal(app.node('users-dashboard').classList.contains('hidden'),false);
  assert.match(app.node('users-list').innerHTML,/&lt;img&gt;/);
  assert.doesNotMatch(app.node('users-list').innerHTML,/<img>/);
  assert.doesNotMatch(source,/localStorage|sessionStorage|RS-[a-f0-9]+/);
});
test('supervisor can open Users but technician cannot',async()=>{
  const app=setup();app.login({...owner,role:'supervisor'});await app.unlock();
  assert.equal(app.calls.length,1);assert.equal(app.node('tab-users').classList.contains('hidden'),false);
  app.login({...owner,role:'technician'});assert.equal(app.node('tab-users').classList.contains('hidden'),true);
});

