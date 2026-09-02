import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const fixture = [{id:'order-1',order_number:'0012',service_date:'2026-09-02',client:'Cliente <prueba>',technician:'Técnico',model:'Modelo',observations:'=1+1',parts:[{code:'0001',quantity:2,description:'Filtro'},{code:'0002',quantity:1,description:'Junta'}]}];

function setup() {
  const nodes = new Map(), listeners = new Map(), calls = [], exports = [];
  let handler = async () => ({data:{orders:fixture},error:null});
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      const events = new Map();
      nodes.set(id, {value:'',textContent:'',innerHTML:'',disabled:false,events,
        classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,force)=>{force=force??!classes.has(x);force?classes.add(x):classes.delete(x);}},
        addEventListener:(event,fn)=>events.set(event,fn),replaceChildren(){this.innerHTML='';},
        close(){},showModal(){},reset(){},focus(){},click(){}
      });
    }
    return nodes.get(id);
  };
  const context = vm.createContext({
    document:{getElementById:node,createElement:()=>({click(){}})},
    window:{addEventListener:(event,fn)=>listeners.set(event,fn),serviceAuth:{client:{rpc:async(name,args)=>{calls.push({name,args});return handler(name,args);}},recheck(){}}},
    location:{hash:''},setTimeout:()=>0,AbortController,Blob,URL,Date,
    XLSX:{utils:{book_new:()=>({sheets:[]}),aoa_to_sheet:rows=>({rows}),book_append_sheet:(book,sheet,name)=>book.sheets.push({sheet,name})},writeFile:(book,name)=>exports.push({book,name})}
  });
  vm.runInContext(script,context);
  const run = text => vm.runInContext(text,context);
  return {node,calls,exports,run,setHandler:fn=>{handler=fn;},login:profile=>listeners.get('service-auth')({detail:profile})};
}
const operator = {email:'operator@example.invalid',role:'operator'};

test('operator sees password gate and can unlock/download both workbook sheets', async () => {
  const app=setup();app.login(operator);app.run("showView('admin')");
  assert.equal(app.node('tab-admin').classList.contains('hidden'),false);
  assert.equal(app.node('admin-gate').classList.contains('hidden'),false);
  assert.equal(app.calls.length,0);
  app.node('admin-password').value='fixture-password';
  await app.node('admin-gate').events.get('submit')({preventDefault(){}});
  assert.equal(app.calls.at(-1).args.p_password,'fixture-password');
  assert.equal(app.node('admin-password').value,'');
  assert.equal(app.run('state.ordersAccess'),true);
  assert.equal(app.node('admin-gate').classList.contains('hidden'),true);
  app.node('export-format').value='xlsx';
  await app.node('export').events.get('click')();
  assert.equal(app.calls.length,2,'download must authorize again');
  assert.equal(app.exports.length,1);
  assert.equal(app.exports[0].book.sheets[0].name,'Órdenes');
  assert.equal(app.exports[0].book.sheets[1].sheet.rows.length,3);
  assert.equal(app.exports[0].book.sheets[1].sheet.rows[1][2],'0001','keep leading zeros');
});

test('principal admin queries without shared password',async()=>{
  const app=setup();app.login({email:'owner@example.invalid',role:'admin'});
  await app.run('loadOrders()');
  assert.equal(app.calls[0].args.p_password,null);
  assert.equal(app.run('state.ordersAccess'),true);
  assert.equal(app.node('admin-gate').classList.contains('hidden'),true);
});

test('wrong password exposes no data and no download',async()=>{
  const app=setup();app.login(operator);app.setHandler(async()=>({data:{error:'Clave incorrecta.'},error:null}));
  app.run("state.password='wrong'");
  await assert.rejects(app.run('loadOrders()'),/Clave incorrecta/);
  assert.equal(app.run('state.orders.length'),0);
  assert.equal(app.run('state.password'),'');
  app.node('export-format').value='xlsx';
  await app.node('export').events.get('click')();
  assert.equal(app.exports.length,0);
});

test('logout and account switch clear data and password; stale response cannot restore them',async()=>{
  const app=setup();app.login(operator);app.run("state.password='fixture-password'");
  await app.run('loadOrders()');
  app.login({...operator});
  assert.equal(app.run('state.password'),'fixture-password','token refresh preserves unlock');
  let resolve;
  app.setHandler(()=>new Promise(r=>{resolve=r;}));
  const pending=app.run('loadOrders()');
  app.login(null);
  resolve({data:{orders:fixture},error:null});
  await assert.rejects(pending,/sesión cambió/);
  assert.equal(app.run('state.orders.length'),0);
  assert.equal(app.run('state.password'),'');
  assert.equal(app.run('state.ordersAccess'),false);
  app.login({email:'other@example.invalid',role:'operator'});
  assert.equal(app.node('admin-gate').classList.contains('hidden'),false);
});

test('locking removes records and shared credential from memory',async()=>{
  const app=setup();app.login(operator);app.run("state.password='fixture-password'");
  await app.run('loadOrders()');app.node('lock-orders').events.get('click')();
  assert.equal(app.run('state.orders.length'),0);assert.equal(app.run('state.password'),'');
  assert.equal(app.node('dashboard').classList.contains('hidden'),true);
});

test('order submission uses authenticated RPC and preserves date/multiple parts',async()=>{
  const app=setup();app.login(operator);
  app.setHandler(async()=>({data:'order-id',error:null}));
  app.run(`submitOrder(${JSON.stringify(fixture[0])})`);
  assert.equal(app.calls[0].name,'submit_service_order_authenticated');
  assert.equal(app.calls[0].args.p_service_date,'2026-09-02');
  assert.equal(app.calls[0].args.p_parts.length,2);
});

test('unauthenticated frontend fails closed and CSV neutralizes formula prefixes',async()=>{
  const app=setup();await assert.rejects(app.run('loadOrders()'),/Iniciá sesión/);
  assert.equal(app.calls.length,0);
  assert.equal(app.run("csvCell('=HYPERLINK(1)')"),'"\'=HYPERLINK(1)"');
  assert.equal(app.run("csvCell('0012')"),'"0012"');
});

test('source does not store shared password or privilege in browser storage',()=>{
  assert.doesNotMatch(script,/localStorage|sessionStorage|RS-[a-f0-9]+/);
  assert.match(html,/type="date"/);
  assert.match(html,/Libro de Excel \(\.xlsx\)/);
});
