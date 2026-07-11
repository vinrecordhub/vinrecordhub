// assets/auth.js — shared Supabase auth helper, loaded by every auth-aware
// page after vendor/supabase.js and supabase-config.js. Exposes window.vrhAuth
// so pages stay framework-free and don't each re-implement session handling.
(function () {
  // If the config was never substituted (placeholder still present) or the SDK
  // failed to load, don't throw and take the whole page down — leave vrhAuth
  // null so pages can show a visible "sign-in unavailable" state instead of
  // silently dead buttons.
  var url = window.VRH_SUPABASE_URL, anon = window.VRH_SUPABASE_ANON_KEY;
  var configured = url && anon && url.indexOf('__') === -1 && anon.indexOf('__') === -1;
  var client;
  try {
    if (!window.supabase || !configured) throw new Error('Supabase not configured');
    client = window.supabase.createClient(url, anon);
  } catch (err) {
    console.error('[vrhAuth] auth unavailable:', err.message);
    window.vrhAuth = null;
    document.addEventListener('DOMContentLoaded', function () {
      document.documentElement.setAttribute('data-auth-unavailable', 'true');
    });
    return;
  }

  function isVerified(user) {
    return !!(user && user.email_confirmed_at);
  }

  async function getSession() {
    var res = await client.auth.getSession();
    return res.data.session || null;
  }

  async function getUser() {
    var session = await getSession();
    return session ? session.user : null;
  }

  function signUpEmail(email, password) {
    return client.auth.signUp({
      email: email,
      password: password,
      options: { emailRedirectTo: window.location.origin + '/account' },
    });
  }

  function signInEmail(email, password) {
    return client.auth.signInWithPassword({ email: email, password: password });
  }

  function signInGoogle() {
    return client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/account' },
    });
  }

  function signOut() {
    return client.auth.signOut();
  }

  function resetPassword(email) {
    return client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
  }

  function updatePassword(newPassword) {
    return client.auth.updateUser({ password: newPassword });
  }

  function resendVerification(email) {
    return client.auth.resend({ type: 'signup', email: email });
  }

  function onAuthChange(cb) {
    var sub = client.auth.onAuthStateChange(function (event, session) {
      cb(event, session);
    });
    return sub.data.subscription;
  }

  // Redirects to login (preserving the current path as ?next=) when there is
  // no session. Resolves with the session when one exists, for pages that
  // need the access token or user object after the guard passes.
  async function requireAuth(redirect) {
    var session = await getSession();
    if (!session) {
      var next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = (redirect || '/login') + '?next=' + next;
      return null;
    }
    return session;
  }

  window.vrhAuth = {
    client: client,
    getSession: getSession,
    getUser: getUser,
    isVerified: isVerified,
    signUpEmail: signUpEmail,
    signInEmail: signInEmail,
    signInGoogle: signInGoogle,
    signOut: signOut,
    resetPassword: resetPassword,
    updatePassword: updatePassword,
    resendVerification: resendVerification,
    onAuthChange: onAuthChange,
    requireAuth: requireAuth,
  };
})();
