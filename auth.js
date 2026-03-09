// ─────────────────────────────────────────────
// auth.js — Login, Signup, Logout
// ─────────────────────────────────────────────

// Toggle between Login and Signup tabs
function showLogin() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('tab-login').classList.add('active');
  document.getElementById('tab-signup').classList.remove('active');
}

function showSignup() {
  document.getElementById('signup-form').classList.remove('hidden');
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('tab-signup').classList.add('active');
  document.getElementById('tab-login').classList.remove('active');
}

// Show parent email field only if role = child
function handleRoleChange() {
  const role = document.getElementById('signup-role').value;
  const field = document.getElementById('parent-email-field');
  if (role === 'child') {
    field.classList.remove('hidden');
  } else {
    field.classList.add('hidden');
  }
}

// ── SIGNUP ──────────────────────────────────
async function handleSignup() {
  const name        = document.getElementById('signup-name').value.trim();
  const email       = document.getElementById('signup-email').value.trim();
  const password    = document.getElementById('signup-password').value;
  const role        = document.getElementById('signup-role').value;
  const parentEmail = document.getElementById('signup-parent-email')?.value.trim();

  if (!name || !email || !password || !role) {
    showAuthError('Please fill in all fields.');
    return;
  }

  // Disable button to prevent duplicate requests
  const btn = document.querySelector('#signup-form .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing up…'; }

  // 1. Create user in Supabase Auth
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  console.log('signUp result — data:', data, 'error:', error);
  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = 'Join the Crew →'; }
    if (error.status === 429 || error.message.toLowerCase().includes('rate')) {
      showAuthError('Too many attempts. Please wait a minute and try again.');
    } else {
      showAuthError(error.message);
    }
    return;
  }

  if (!data.user) {
    if (btn) { btn.disabled = false; btn.textContent = 'Join the Crew →'; }
    showAuthError('Signup failed — please try again.');
    return;
  }

  const userId = data.user.id;

  // 2. Find parent's ID if role is child
  let parentId = null;
  if (role === 'child' && parentEmail) {
    const { data: p } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('email', parentEmail)
      .single();
    if (p) parentId = p.id;
  }

  // 3. Save profile to 'profiles' table
  const { error: profileError } = await supabaseClient.from('profiles').insert({
    id: userId,
    name: name,
    email: email,
    role: role,
    parent_id: parentId
  });

  console.log('Profile insert result — error:', profileError);

  if (profileError) {
    if (btn) { btn.disabled = false; btn.textContent = 'Join the Crew →'; }
    showAuthError('Account created but profile save failed: ' + profileError.message);
    return;
  }

  // 4. Go to dashboard
  window.location.href = 'dashboard.html';
}

// ── LOGIN ────────────────────────────────────
async function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    showAuthError('Enter your email and password.');
    return;
  }

  // Disable button to prevent duplicate requests
  const btn = document.querySelector('#login-form .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Logging in…'; }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = 'Set Sail →'; }
    if (error.status === 429 || error.message.toLowerCase().includes('rate')) {
      showAuthError('Too many attempts. Please wait a minute and try again.');
    } else {
      showAuthError(error.message);
    }
    return;
  }

  window.location.href = 'dashboard.html';
}

// ── LOGOUT ───────────────────────────────────
async function handleLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

// ── Helper: show error ────────────────────────
function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── On page load: if already logged in → dashboard
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = 'dashboard.html';
});