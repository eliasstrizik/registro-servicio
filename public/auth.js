/* Supabase owns OTP generation, delivery, verification, and session refresh. */
(() => {
  const byId = id => document.getElementById(id);
  const client = window.supabase.createClient(
    'https://pjssnfuwicveicrojhqk.supabase.co',
    'sb_publishable_Je2abjg-qkJRnZgqNPZGXg_buZE3Y_f',
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
  );
  let pendingEmail = '';
  let profile = null;
  let revision = 0;
  let resendAt = 0;

  function message(text, bad = false) {
    byId('auth-status').textContent = text;
    byId('auth-status').className = bad ? 'status bad' : 'status';
  }

  function publish(next) {
    profile = next;
    byId('auth-view').classList.toggle('hidden', Boolean(next));
    byId('app-shell').classList.toggle('hidden', !next);
    byId('account-email').textContent = next?.email || '';
    byId('retry-session').classList.add('hidden');
    window.dispatchEvent(new CustomEvent('service-auth', { detail: next }));
  }

  async function recheck() {
    const requestRevision = ++revision;
    const { data, error } = await client.auth.getSession();
    if (requestRevision !== revision) return;
    if (error || !data.session) {
      publish(null);
      message(error ? 'No se pudo recuperar la sesión. Volvé a ingresar.' : '');
      return;
    }
    const response = await client.rpc('get_my_service_profile');
    if (requestRevision !== revision) return;
    if (response.error || !response.data) {
      publish(null);
      message(response.error?.code === '42501'
        ? 'Tu correo no tiene acceso. Contactá a administración.'
        : 'No se pudo validar tu acceso. Reintentá en unos segundos.', true);
      byId('retry-session').classList.remove('hidden');
      return;
    }
    publish(response.data);
    byId('login-code').value = '';
    byId('login-code-form').classList.add('hidden');
    byId('login-email-form').classList.remove('hidden');
  }

  byId('login-email-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (Date.now() < resendAt) {
      message(`Esperá ${Math.ceil((resendAt - Date.now()) / 1000)} segundos antes de pedir otro código.`);
      return;
    }
    pendingEmail = byId('login-email').value.trim().toLowerCase();
    const button = byId('send-code');
    button.disabled = true;
    message('Enviando código…');
    try {
      const { error } = await client.auth.signInWithOtp({
        email: pendingEmail,
        options: { shouldCreateUser: true }
      });
      if (error) throw error;
      resendAt = Date.now() + 60000;
      byId('login-email-form').classList.add('hidden');
      byId('login-code-form').classList.remove('hidden');
      message(`Revisá ${pendingEmail}, incluida la carpeta de spam. El código vence en 10 minutos.`);
      byId('login-code').focus();
    } catch (error) {
      const text = error.message || '';
      const code = error.code || '';
      message(code === 'over_email_send_rate_limit' || /email.*rate.*limit/i.test(text)
        ? 'Se agotó temporalmente el cupo de correos por hora de todo el equipo. Se libera automáticamente; no hace falta pedir códigos repetidamente. Reintentá más tarde o contactá a administración si continúa.'
        : /security purposes.*seconds|after \d+ seconds/i.test(text)
          ? 'Todavía no se puede reenviar a este correo. Dejá pasar al menos 60 segundos desde el último pedido y reintentá una sola vez.'
        : code === 'over_request_rate_limit' || error.status === 429 || /rate.*limit/i.test(text)
          ? 'Hay demasiadas solicitudes de acceso. Dejá de reintentar por el momento y probá más tarde. Si continúa, contactá a administración.'
        : /habilitado|autorizado|not allowed|signup.*disabled/i.test(text)
        ? 'Ese correo no está habilitado. Contactá a administración.'
        : 'No pudimos enviar el código. Reintentá más tarde o contactá a administración.', true);
    } finally {
      button.disabled = false;
    }
  });

  byId('login-code-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = byId('verify-code');
    button.disabled = true;
    message('Verificando código…');
    try {
      const { error } = await client.auth.verifyOtp({
        email: pendingEmail,
        token: byId('login-code').value.trim(),
        type: 'email'
      });
      if (error) throw error;
      await recheck();
    } catch {
      message('El código no es válido o venció. Revisalo o solicitá otro.', true);
    } finally {
      button.disabled = false;
    }
  });

  byId('change-email').addEventListener('click', () => {
    byId('login-code').value = '';
    byId('login-code-form').classList.add('hidden');
    byId('login-email-form').classList.remove('hidden');
    message('Podés cambiar el correo o solicitar otro código después de 60 segundos.');
    byId('login-email').focus();
  });

  byId('sign-out').addEventListener('click', async () => {
    revision++;
    publish(null);
    message('Cerrando sesión…');
    const { error } = await client.auth.signOut({ scope: 'local' });
    message(error ? 'No se pudo cerrar la sesión en el servidor. Reintentá la conexión.' : 'Sesión cerrada.');
  });
  byId('retry-session').addEventListener('click', () => recheck());

  // Supabase auth callbacks must not await additional auth calls (lock contention).
  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      revision++;
      publish(null);
    } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      setTimeout(() => recheck(), 0);
    }
  });
  window.serviceAuth = { client, recheck, get profile() { return profile; } };
})();
