/* User management is authorized again by the database on every operation. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let profile = null, password = '', users = [], unlocked = false;
  let revision = 0, busy = false, pending = null;
  function status(message = '', bad = false) {
    $('users-status').textContent = message;
    $('users-status').className = bad ? 'status bad' : 'status';
  }
  function setBusy(value) {
    busy = value;
    for (const id of ['unlock-users','add-user','refresh-users','user-confirm-save']) $(id).disabled = value;
    $('users-list').querySelectorAll('button').forEach(button => { button.disabled = value; });
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
    $('users-count').textContent = `${users.filter(user => user.active).length} habilitados / ${users.length} total`;
    $('users-list').innerHTML = filtered.length ? filtered.map(user => `<article class="card card-body"><div class="fields"><div style="overflow-wrap:anywhere"><b>${esc(user.email)}</b><p class="status">${user.role === 'admin' ? 'Administrador · protegido' : 'Operador'}</p></div><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="pill">${user.active ? 'Habilitado' : 'Desactivado'}</span>${user.role === 'admin' ? '<span class="status">No editable</span>' : `<button class="btn btn-outline" type="button" data-user-email="${esc(user.email)}">${user.active ? 'Desactivar' : 'Activar'}</button>`}</div></div></article>`).join('') : '<div class="card empty-orders">No hay correos que coincidan con la búsqueda.</div>';
  }
  async function request(action = 'list', email = null, active = null) {
    if (profile?.role !== 'admin') { lock(); status('Solo el administrador puede gestionar usuarios.', true); return false; }
    if (busy) return false;
    const current = ++revision, account = profile.email;
    setBusy(true); status(action === 'list' ? 'Consultando usuarios…' : 'Guardando cambio…');
    try {
      const {data, error} = await window.serviceAuth.client.rpc('manage_service_users', {
        p_password: password, p_action: action, p_email: email, p_active: active
      });
      if (current !== revision || account !== profile?.email) return false;
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!Array.isArray(data?.users)) throw new Error('Respuesta inválida del servidor.');
      users = data.users; unlocked = true; render();
      $('users-gate').classList.add('hidden'); $('users-dashboard').classList.remove('hidden');
      status(action === 'list' ? '' : 'Cambio guardado.');
      return true;
    } catch (error) {
      if (current === revision) {
        lock(); status(error.message || 'No se pudo completar la operación. Reintentá.', true);
        if (error.code === '42501') window.serviceAuth.recheck();
      }
      return false;
    } finally { if (current === revision) setBusy(false); }
  }
  window.addEventListener('service-auth', event => {
    const next = event.detail;
    if (!next || next.email !== profile?.email || next.role !== profile?.role) lock();
    profile = next;
    $('tab-users').classList.toggle('hidden', next?.role !== 'admin');
    if (next?.role !== 'admin') $('users-view').classList.add('hidden');
  });
  $('users-gate').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    password = $('users-password').value; $('users-password').value = '';
    await request();
  });
  function confirmChange(action, email, active = null) {
    if (!unlocked || busy || profile?.role !== 'admin') return;
    pending = {action, email, active};
    $('user-confirm-title').textContent = action === 'add' ? 'Agregar usuario' : active ? 'Activar usuario' : 'Desactivar usuario';
    $('user-confirm-message').textContent = action === 'add' || active
      ? `${email} podrá ingresar con su correo, cargar órdenes y consultar/descargar registros si conoce la clave compartida. ¿Confirmás habilitarlo?`
      : `${email} perderá el acceso en su próxima operación. Sus órdenes existentes se conservan. ¿Confirmás desactivarlo?`;
    $('user-confirm').showModal();
  }
  $('add-user-form').addEventListener('submit', event => {
    event.preventDefault(); confirmChange('add', $('new-user-email').value.trim().toLowerCase());
  });
  $('users-list').addEventListener('click', event => {
    const email = event.target.closest('[data-user-email]')?.dataset.userEmail;
    const user = users.find(item => item.email === email);
    if (user && user.role !== 'admin') confirmChange('set_active', email, !user.active);
  });
  $('user-confirm-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!pending || busy) return;
    const change = pending; pending = null; $('user-confirm').close();
    if (await request(change.action, change.email, change.active)) $('new-user-email').value = '';
  });
  $('user-confirm-cancel').addEventListener('click', () => { pending = null; $('user-confirm').close(); });
  $('user-confirm').addEventListener('cancel', () => { pending = null; });
  $('users-search').addEventListener('input', render);
  $('refresh-users').addEventListener('click', () => request());
  $('lock-users').addEventListener('click', () => { lock(); status('Usuarios bloqueados.'); });
  window.serviceUsers = { lock, refreshIfUnlocked: () => { if (unlocked && !busy) request(); } };
})();

