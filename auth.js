// ─────────────────────────────────────────────
// auth.js — Login, Signup, Logout
// ─────────────────────────────────────────────

// Toggle between Login and Signup tabs
function showLogin() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('tab-login').classList.add('active');
  document.getElementById('tab-signup').classList.remove('active');
  document.getElementById('auth-error').classList.add('hidden');
}

function showSignup() {
  document.getElementById('signup-form').classList.remove('hidden');
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('tab-signup').classList.add('active');
  document.getElementById('tab-login').classList.remove('active');
  document.getElementById('auth-error').classList.add('hidden');
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
  const authSubmitBtn = document.getElementById('auth-submit-btn-signup');
  if (authSubmitBtn) authSubmitBtn.disabled = true;

  document.getElementById('auth-error').classList.add('hidden');
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

  // 4. Go to confirmation screen
  showEmailConfirmation(email);
  if (authSubmitBtn) authSubmitBtn.disabled = false;
}

function showEmailConfirmation(email) {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('auth-tabs').classList.add('hidden');
  document.getElementById('auth-error').classList.add('hidden');
  const div = document.createElement('div');
  div.style.textAlign = 'center';
  div.style.padding   = '10px 0';
  div.innerHTML = `
    <div style="font-size:3rem;margin-bottom:16px">📬</div>
    <h2 style="font-family:'Pirata One',cursive;color:#E8503A;font-size:1.4rem;margin-bottom:10px">
      Check Your Email!
    </h2>
    <p style="color:var(--text-mid);font-size:0.9rem;line-height:1.6;margin-bottom:20px">
      We sent a confirmation link to<br>
      <strong>${email}</strong><br><br>
      Click the link to verify, then come back and log in.
    </p>
    <button onclick="location.reload()" class="btn-primary">Back to Login</button>
  `;
  document.querySelector('.auth-card').appendChild(div);
}

// ── LOGIN ────────────────────────────────────
async function handleLogin() {
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  if (authSubmitBtn) authSubmitBtn.disabled = true;

  document.getElementById('auth-error').classList.add('hidden');
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    showAuthError('Enter your email and password.');
    if (authSubmitBtn) authSubmitBtn.disabled = false;
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
    } else if (error.message.toLowerCase().includes('confirm')) {
      showAuthError('Please confirm your email first. Check your inbox!');
    } else {
      showAuthError(error.message);
    }
    if (authSubmitBtn) authSubmitBtn.disabled = false;
    return;
  }

  if (authSubmitBtn) authSubmitBtn.disabled = false;
  window.location.href = 'dashboard.html';
}

// ── LOGOUT ───────────────────────────────────
async function handleLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

// ── Helper: show error ────────────────────────
function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function toggleDarkAuth() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('darkMode', isDark);
  const btn = document.getElementById('auth-dark-btn');
  if (btn) {
    btn.innerHTML = isDark ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
    if (window.lucide) lucide.createIcons();
  }
}

// ── On page load: if already logged in → dashboard
window.addEventListener('DOMContentLoaded', async () => {
  const isDark = localStorage.getItem('darkMode') === 'true';
  const btn = document.getElementById('auth-dark-btn');
  if (isDark) {
    document.body.classList.add('dark');
    if (btn) btn.innerHTML = '<i data-lucide="sun"></i>';
  } else {
    if (btn) btn.innerHTML = '<i data-lucide="moon"></i>';
  }
  if (window.lucide) lucide.createIcons();

  // Only redirect if we are on the login page (login.html or root)
  const isLoginPage = window.location.pathname.endsWith('login.html') || window.location.pathname === '/' || window.location.pathname === '';
  if (!isLoginPage) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = 'dashboard.html';
});