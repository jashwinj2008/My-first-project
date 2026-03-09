// ─────────────────────────────────────────────
// app.js — Dashboard Logic
// ─────────────────────────────────────────────

let currentUser    = null; // logged-in user
let currentProfile = null; // name, role from DB

// ── 1. INIT — runs when page loads ───────────
window.addEventListener('DOMContentLoaded', async () => {

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }

  currentUser = session.user;
  await loadProfile();
  if (!currentProfile) return;

  // Show correct dashboard based on role
  if (currentProfile.role === 'parent') {
    await showParentDashboard();
  } else {
    await showChildDashboard();
  }
});

// ── 2. LOAD PROFILE ──────────────────────────
async function loadProfile() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  console.log('loadProfile — data:', data, 'error:', error, 'userId:', currentUser.id);

  if (!data) {
    // Profile row missing — sign out and go to login
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
    return;
  }

  currentProfile = data;
  document.getElementById('user-name').textContent = data.name;
  document.getElementById('banner-name').textContent = data.name;
  document.getElementById('user-role-badge').textContent =
    data.role === 'parent' ? '⚓ Captain' : '🏴‍☠️ Crew';
}

// ── 3. SHOW CHILD DASHBOARD ──────────────────
async function showChildDashboard() {
  document.getElementById('child-section').classList.remove('hidden');
  await loadChildTasks();
  initMap('child-map');
}

// ── 4. SHOW PARENT DASHBOARD ─────────────────
async function showParentDashboard() {
  document.getElementById('parent-section').classList.remove('hidden');
  await loadChildrenTasks();
  await loadSOSAlerts();
  initMap('parent-map');
}

// ── 5. LOAD CHILD'S OWN TASKS ────────────────
async function loadChildTasks() {
  const { data: tasks } = await supabaseClient
    .from('tasks')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  renderTasks(tasks, 'child-task-list');
  updateProgress(tasks);
}

// ── 6. LOAD PARENT — all children tasks ──────
async function loadChildrenTasks() {
  const { data: children } = await supabaseClient
    .from('profiles')
    .select('id, name')
    .eq('parent_id', currentUser.id);

  if (!children || children.length === 0) {
    document.getElementById('parent-task-list').innerHTML =
      '<p class="empty-msg">No crew linked yet. Ask your child to sign up with your email.</p>';
    return;
  }

  const childIds = children.map(c => c.id);
  const { data: tasks } = await supabaseClient
    .from('tasks')
    .select('*')
    .in('user_id', childIds)
    .order('created_at', { ascending: false });

  renderParentTasks(tasks, children);
}

// ── 7. RENDER TASKS — child view ─────────────
function renderTasks(tasks, containerId) {
  const el = document.getElementById(containerId);

  if (!tasks || tasks.length === 0) {
    el.innerHTML = '<p class="empty-msg">No tasks yet. Add one to set sail! 🌊</p>';
    return;
  }

  // Build HTML string for each task
  el.innerHTML = tasks.map(task => `
    <div class="task-card ${task.is_complete ? 'done' : ''}">
      <div class="task-info">
        <h3 class="task-title ${task.is_complete ? 'striked' : ''}">${task.title}</h3>
        <div class="task-meta">
          <span class="badge subject">${task.subject || 'General'}</span>
          <span class="badge priority ${task.priority}">${task.priority}</span>
          ${task.due_date ? `<span class="badge due">📅 ${task.due_date}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button onclick="toggleComplete('${task.id}', ${task.is_complete})"
          class="btn-icon ${task.is_complete ? 'btn-undo' : 'btn-done'}">
          ${task.is_complete ? '↩' : '✓'}
        </button>
        <button onclick="deleteTask('${task.id}')" class="btn-icon btn-delete">🗑</button>
      </div>
    </div>
  `).join('');
}

// ── 8. RENDER TASKS — parent view ────────────
function renderParentTasks(tasks, children) {
  const el = document.getElementById('parent-task-list');

  el.innerHTML = children.map(child => {
    const childTasks = (tasks || []).filter(t => t.user_id === child.id);
    const done = childTasks.filter(t => t.is_complete).length;

    return `
      <div class="child-group">
        <h3 class="child-name">🏴‍☠️ ${child.name}
          <span class="child-progress">${done}/${childTasks.length} done</span>
        </h3>
        ${childTasks.length === 0
          ? '<p class="empty-msg">No tasks yet.</p>'
          : childTasks.map(task => `
            <div class="task-card ${task.is_complete ? 'done' : ''}">
              <h4 class="task-title ${task.is_complete ? 'striked' : ''}">${task.title}</h4>
              <span>${task.is_complete ? '✅' : '⏳'}</span>
            </div>
          `).join('')
        }
      </div>
    `;
  }).join('');
}

// ── 9. ADD TASK ───────────────────────────────
async function addTask() {
  const title    = document.getElementById('task-title').value.trim();
  const subject  = document.getElementById('task-subject').value.trim();
  const dueDate  = document.getElementById('task-due').value;
  const priority = document.getElementById('task-priority').value;

  if (!title) { alert('Enter a task title!'); return; }

  await supabaseClient.from('tasks').insert({
    user_id: currentUser.id,
    title, subject, priority,
    due_date: dueDate || null,
    is_complete: false
  });

  // Clear inputs
  document.getElementById('task-title').value   = '';
  document.getElementById('task-subject').value = '';
  document.getElementById('task-due').value    = '';

  await loadChildTasks(); // refresh list
}

// ── 10. TOGGLE COMPLETE ───────────────────────
async function toggleComplete(taskId, currentStatus) {
  await supabaseClient
    .from('tasks')
    .update({ is_complete: !currentStatus })
    .eq('id', taskId);
  await loadChildTasks();
}

// ── 11. DELETE TASK ───────────────────────────
async function deleteTask(taskId) {
  if (!window.confirm('Remove this task?')) return;
  await supabaseClient.from('tasks').delete().eq('id', taskId);
  await loadChildTasks();
}

// ── 12. PROGRESS BAR ─────────────────────────
function updateProgress(tasks) {
  if (!tasks || tasks.length === 0) {
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('progress-text').textContent = '0 of 0 tasks done';
    return;
  }
  const done  = tasks.filter(t => t.is_complete).length;
  const total = tasks.length;
  const pct   = Math.round((done / total) * 100);
  document.getElementById('progress-bar').style.width    = pct + '%';
  document.getElementById('progress-text').textContent = `${done} of ${total} tasks done`;
}

// ── 13. SOS — child sends alert ───────────────
async function sendSOS() {
  await supabaseClient.from('sos_alerts').insert({
    child_id: currentUser.id,
    child_name: currentProfile.name,
    message: '🆘 SOS Alert!'
  });

  const btn = document.getElementById('sos-btn');
  btn.textContent = '✅ Alert Sent!';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = '🆘 Send SOS';
    btn.disabled = false;
  }, 3000);
}

// ── 14. LOAD SOS ALERTS — parent ─────────────
async function loadSOSAlerts() {
  const { data: children } = await supabaseClient
    .from('profiles')
    .select('id')
    .eq('parent_id', currentUser.id);

  if (!children || children.length === 0) return;

  const childIds = children.map(c => c.id);
  const { data: alerts } = await supabaseClient
    .from('sos_alerts')
    .select('*')
    .in('child_id', childIds)
    .order('created_at', { ascending: false })
    .limit(5);

  const el = document.getElementById('sos-list');
  if (!alerts || alerts.length === 0) {
    el.innerHTML = '<p class="empty-msg">No alerts. Crew is safe! ✅</p>';
    return;
  }
  el.innerHTML = alerts.map(a => `
    <div class="sos-card">
      <span>🆘 <strong>${a.child_name}</strong> sent an alert</span>
      <span class="sos-time">${new Date(a.created_at).toLocaleString()}</span>
    </div>
  `).join('');
}

// ── 15. MAP — Leaflet.js ──────────────────────
function initMap(containerId) {
  try {
    const lat = 13.0827, lng = 80.2707;
    const map = L.map(containerId).setView([lat, lng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);

    L.marker([lat, lng])
      .addTo(map)
      .bindPopup(`📍 ${currentProfile.name}'s Location`)
      .openPopup();
  } catch (e) {
    console.error('Map failed to load:', e);
  }
}