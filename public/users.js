/* User management is authorized again by the database on every operation. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const levels = {admin:5,sub_admin:4,supervisor:3,technician:2,user:1};
  const labels = {admin:'Administrador principal',sub_admin:'Subadministrador',supervisor:'Supervisor',technician:'Técnico',user:'Usuario'};
  let profile = null, password = '', users = [], unlocked = false;
  let revision = 0, busy = false, pending = null;
  const level = role => levels[role] || 0;
  const allowedRoles = () => Object.keys(levels).filter(role => role !== 'admin' && level(role) < level(profile?.role));
  function status(message = '', bad = false) {
    $('users-status').textContent = message;
    $('users-status').className = bad ? 'status bad' : 'status';
  }
  function setBusy(value) {
    busy = value;
    for (const id of ['unlock-users','add-user','refresh-users','user-confirm-save']) $(id).disabled = value;
    $('users-list').querySelectorAll('button,select').forEach(control => { control.disabled = value; });
  }
  function fillNewRoleOptions() {
    $('new-user-role').innerHTML = allowedRoles().map(role => `<option value="${role}">${labels[role]}</option>`).join('');
  }
  function lock() {
    revision++; password = ''; users = []; unlocked = false; pending = null;
    $('users-password').value = ''; $('new-user-email').value = ''; $('users-search').value = '';
    $('users-count').textContent = ''; $('users-list').replaceChildren();
    $('users-dashboard').classList.add('hidden'); $('users-gate').classList.remove('hidden');
    $('user-confirm').close(); $('user-confirm-message').textContent = '';
    setBusy(false); status();
  }
  function render() {
    const search = $('users-search').value.trim().toLowerCase();
    const filtered = users.filter(user => user.email.includes(search));
    $('users-count').textContent = `${users.filter(user => user.active).length} habilitados / ${users.length} visibles`;
    $('users-list').innerHTML = filtered.length ? filtered.map(user => {
      const editable = user.email !== profile?.email && user.role !== 'admin' && level(user.role) < level(profile?.role);
      const options = allowedRoles().map(role => `<option value="${role}" ${role===user.role?'selected':''}>${labels[role]}</option>`).join('');
      return `<article class="card card-body"><div class="fields"><div style="overflow-wrap:anywhere"><b>${esc(user.email)}</b><p class="status">${labels[user.role] || user.role}${editable?'':' · protegido'}</p></div><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="pill">${user.active?'Habilitado':'Desactivado'}</span>${editable?`<select aria-label="Rango de ${esc(user.email)}" data-role-email="${esc(user.email)}">${options}</select><button class="btn btn-outline" type="button" data-active-email="${esc(user.email)}">${user.active?'Desactivar':'Activar'}</button>`:'<span class="status">No editable</span>'}</div></div></article>`;
    }).join('') : '<div class="card empty-orders">No hay correos que coincidan con la búsqueda.</div>';
  }
  async function request(action = 'list', email = null, active = null, role = null) {
    if (level(profile?.role) < 3) { lock(); status('Tu rango no permite gestionar usuarios.', true); return false; }
    if (busy) return false;
    const current = ++revision, account = profile.email;
    setBusy(true); status(action === 'list' ? 'Consultando usuarios…' : 'Guardando cambio…');
    try {
      const {data,error} = await window.serviceAuth.client.rpc('manage_service_users', {
        p_password:password,p_action:action,p_email:email,p_active:active,p_role:role
      });
      if (current !== revision || account !== profile?.email) return false;
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!Array.isArray(data?.users)) throw new Error('Respuesta inválida del servidor.');
      users = data.users; unlocked = true; render();
      $('users-gate').classList.add('hidden'); $('users-dashboard').classList.remove('hidden');
      status(action === 'list' ? '' : 'Cambio guardado.'); return true;
    } catch (error) {
      if (current === revision) { lock(); status(error.message || 'No se pudo completar la operación. Reintentá.', true); if (error.code === '42501') window.serviceAuth.recheck(); }
      return false;
    } finally { if (current === revision) setBusy(false); }
  }
  window.addEventListener('service-auth', event => {
    const next = event.detail;
    if (!next || next.email !== profile?.email || next.role !== profile?.role) lock();
    profile = next; fillNewRoleOptions();
    $('tab-users').classList.toggle('hidden', level(next?.role) < 3);
    if (level(next?.role) < 3) $('users-view').classList.add('hidden');
  });
  $('users-gate').addEventListener('submit', async event => { event.preventDefault(); if (busy) return; password=$('users-password').value; $('users-password').value=''; await request(); });
  function confirmChange(action,email,active=null,role=null) {
    if (!unlocked || busy || level(profile?.role)<3) return;
    pending={action,email,active,role};
    $('user-confirm-title').textContent=action==='add'?'Agregar usuario':action==='set_role'?'Cambiar rango':active?'Activar usuario':'Desactivar usuario';
    $('user-confirm-message').textContent=action==='set_role'
      ? `${email} pasará al rango ${labels[role]}. ¿Confirmás el cambio?`
      : action==='add' ? `${email} podrá ingresar con rango ${labels[role]}. ¿Confirmás habilitarlo?`
      : active ? `${email} recuperará el acceso con su rango actual. ¿Confirmás activarlo?`
      : `${email} perderá el acceso en su próxima operación. Sus órdenes se conservan. ¿Confirmás desactivarlo?`;
    $('user-confirm').showModal();
  }
  $('add-user-form').addEventListener('submit', event => { event.preventDefault(); confirmChange('add',$('new-user-email').value.trim().toLowerCase(),null,$('new-user-role').value); });
  $('users-list').addEventListener('change', event => {
    const email=event.target.closest('[data-role-email]')?.dataset.roleEmail;
    const user=users.find(item=>item.email===email);
    if(user && event.target.value!==user.role) confirmChange('set_role',email,null,event.target.value);
  });
  $('users-list').addEventListener('click', event => {
    const email=event.target.closest('[data-active-email]')?.dataset.activeEmail;
    const user=users.find(item=>item.email===email);
    if(user) confirmChange('set_active',email,!user.active,user.role);
  });
  $('user-confirm-form').addEventListener('submit', async event => { event.preventDefault(); if(!pending||busy)return;const change=pending;pending=null;$('user-confirm').close();if(await request(change.action,change.email,change.active,change.role))$('new-user-email').value=''; });
  $('user-confirm-cancel').addEventListener('click',()=>{pending=null;$('user-confirm').close();render()});
  $('user-confirm').addEventListener('cancel',()=>{pending=null;render()});
  $('users-search').addEventListener('input',render);
  $('refresh-users').addEventListener('click',()=>request());
  $('lock-users').addEventListener('click',()=>{lock();status('Usuarios bloqueados.')});
  window.serviceUsers={lock,refreshIfUnlocked:()=>{if(unlocked&&!busy)request()}};
})();

