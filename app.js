// ─────────────────────────────────────────────
// app.js — Dashboard Logic
// ─────────────────────────────────────────────

let currentUser    = null; // logged-in user
let currentProfile = null; // name, role from DB

// ── CUSTOM MODAL FUNCTIONS ───────────────────
function showCustomAlert(message, icon = 'alert-triangle') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('custom-modal-overlay');
    const modal = document.getElementById('custom-modal');
    const iconEl = document.getElementById('modal-icon');
    const messageEl = document.getElementById('modal-message');
    const buttonsEl = document.getElementById('modal-buttons');

    iconEl.innerHTML = `<i data-lucide="${icon}"></i>`;
    messageEl.textContent = message;
    buttonsEl.innerHTML = '<button class="btn btn-primary" id="modal-ok-btn">OK</button>';

    overlay.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
    
    document.getElementById('modal-ok-btn').onclick = () => {
      overlay.style.display = 'none';
      resolve();
    };
  });
}

function showCustomConfirm(message, icon = 'help-circle') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('custom-modal-overlay');
    const iconEl = document.getElementById('modal-icon');
    const messageEl = document.getElementById('modal-message');
    const buttonsEl = document.getElementById('modal-buttons');

    iconEl.innerHTML = `<i data-lucide="${icon}"></i>`;
    messageEl.textContent = message;
    buttonsEl.innerHTML = `
      <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="modal-confirm-btn">Confirm</button>
    `;

    overlay.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
    
    document.getElementById('modal-cancel-btn').onclick = () => {
      overlay.style.display = 'none';
      resolve(false);
    };
    
    document.getElementById('modal-confirm-btn').onclick = () => {
      overlay.style.display = 'none';
      resolve(true);
    };
  });
}

function showLocationPermissionModal() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('location-modal-overlay');
    overlay.style.display = 'flex';
    
    document.getElementById('allow-location-btn').onclick = () => {
      overlay.style.display = 'none';
      resolve(true);
    };
  });
}

// ── 1. INIT — runs when page loads ───────────
window.addEventListener('DOMContentLoaded', async () => {
  const isDark = localStorage.getItem('darkMode') === 'true';
  if (isDark) {
    document.body.classList.add('dark');
    document.getElementById('dark-toggle-btn').innerHTML = '<i data-lucide="sun"></i>';
    if (window.lucide) lucide.createIcons();
  }

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

  // PGRST116 = "no rows found" — genuine missing profile, safe to sign out.
  // Any other error (network, server) means we shouldn't sign the user out.
  if (error && error.code !== 'PGRST116') {
    document.getElementById('user-name').textContent = 'Error loading profile';
    console.error('loadProfile error:', error.message);
    return;
  }

  if (!data) {
    // Profile row genuinely missing — sign out and go to login
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
    return;
  }

  currentProfile = data;
  const bannerName = document.getElementById('banner-name');
  if (bannerName) bannerName.textContent = data.name;

  const avatar = data.avatar || '🏴‍☠️';
  const navAvatar = document.getElementById('nav-avatar');
  if (navAvatar) navAvatar.textContent = avatar;
}

// ── 3. SHOW CHILD DASHBOARD ──────────────────
async function showChildDashboard() {
  document.getElementById('child-section').classList.remove('hidden');
  await loadChildTasks();

  // Fetch the latest location from DB before drawing the map
  const { data: loc } = await supabaseClient
    .from('locations')
    .select('latitude, longitude')
    .eq('child_id', currentUser.id)
    .single();

  if (loc) {
    currentProfile.latitude = loc.latitude;
    currentProfile.longitude = loc.longitude;
  }

  initMap('child-map');
  startLocationTracking();
}

async function startLocationTracking() {
  console.log('Location tracking started');
  if (!navigator.geolocation) {
    console.log('Geolocation NOT supported');
    return;
  } else {
    console.log('Geolocation IS supported');
  }

  // Show custom location permission modal before requesting
  const userAllowed = await showLocationPermissionModal();
  if (!userAllowed) return;

  const options = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  };

  console.log('Requesting constant GPS updates...');
  navigator.geolocation.watchPosition(async (pos) => {
    const { latitude, longitude } = pos.coords;
    console.log('GPS received:', latitude, longitude);
    
    // Update local profile
    if (!currentProfile) return;
    currentProfile.last_lat = latitude;
    currentProfile.last_lng = longitude;

    // Send to database (Handled unique constraint conflict)
    const { error } = await supabaseClient.from('locations').upsert({
      child_id: currentUser.id,
      latitude: latitude,
      longitude: longitude,
      updated_at: new Date().toISOString()
    });

    if (error) {
      console.error('GPS Save Error:', error.message);
      // Fallback: If upsert fails due to missing constraint, try a basic insert
      if (error.message.includes('ON CONFLICT')) {
        await supabaseClient.from('locations').insert({
          child_id: currentUser.id,
          latitude: latitude,
          longitude: longitude,
          updated_at: new Date().toISOString()
        });
      }
    } else {
      console.log('GPS saved successfully to locations table');
      // Update the map marker without re-initializing the whole map
      updateChildMarker(latitude, longitude);

      // Force map to zoom to this location if it hasn't already
      if (window.mapInstances && window.mapInstances['child-map']) {
        const map = window.mapInstances['child-map'];
        if (!window.hasZoomedToGPS) {
          map.setView([latitude, longitude], 15);
          window.hasZoomedToGPS = true;
        }
      }
    }
  }, async (err) => {
    console.error('Location error:', err.message);
    if (err.code === 1) await showCustomAlert('Please enable location access for the map to work properly.', 'map-pin');
  }, options);
}

function updateChildMarker(lat, lng) {
  const mapId = 'child-map';
  if (window.mapInstances && window.mapInstances[mapId]) {
    const map = window.mapInstances[mapId];
    
    // If marker doesn't exist, create it. Otherwise move it.
    if (!window.childMarker) {
      const popupContent = `
        <div style="display:flex; align-items:center; gap:8px; font-family:'Nunito',sans-serif;">
          <span style="color:#E8503A; font-size:1.2rem;">📍</span>
          <span style="font-weight:700; color:#2C1810;">${currentProfile.name.toLowerCase()}'s Location</span>
        </div>
      `;
      window.childMarker = L.marker([lat, lng]).addTo(map)
        .bindPopup(popupContent, { className: 'custom-popup' }).openPopup();
    } else {
      window.childMarker.setLatLng([lat, lng]);
    }
    map.panTo([lat, lng]); // Smoothly slide to the new location
  }
}

// ── 4. SHOW PARENT DASHBOARD ─────────────────
async function showParentDashboard() {
  document.getElementById('parent-section').classList.remove('hidden');
  const children = await loadChildrenTasks();
  await loadSOSAlerts();
  
  if (children && children.length > 0) {
    initParentMap('parent-map', children);
  } else {
    initMap('parent-map');
  }

  // Refresh alerts every 30 seconds
  setInterval(loadSOSAlerts, 30000);
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
    .select('*')
    .eq('parent_id', currentUser.id);

  if (!children || children.length === 0) {
    const listEl = document.getElementById('parent-task-list');
    if (listEl) {
      listEl.innerHTML = '<p class="empty-msg">No crew linked yet. Ask your child to sign up with your email.</p>';
    }
    return [];
  }

  // Fetch from 'locations' table since 'profiles' doesn't have GPS columns
  const childIds = children.map(c => c.id);
  const { data: locations } = await supabaseClient
    .from('locations')
    .select('*')
    .in('child_id', childIds);

  children.forEach(child => {
    const loc = locations?.find(l => l.child_id === child.id);
    if (loc) {
      child.latitude = loc.latitude;
      child.longitude = loc.longitude;
      child.updated_at = loc.updated_at;
    }
  });

  const { data: tasks } = await supabaseClient
    .from('tasks')
    .select('*')
    .in('user_id', childIds)
    .order('created_at', { ascending: false });

  renderParentTasks(tasks, children);
  return children;
}

// ── 7. RENDER TASKS — child view ─────────────
function getDueDateInfo(dueDateStr) {
  if (!dueDateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dueDateStr); due.setHours(0,0,0,0);
  const diff  = Math.round((due - today) / (1000 * 60 * 60 * 24));
  if (diff < 0)  return { label: 'Overdue by ' + Math.abs(diff) + 'd', cls: 'overdue' };
  if (diff === 0) return { label: 'Due Today',     cls: 'due-soon' };
  if (diff === 1) return { label: 'Due Tomorrow',   cls: 'due-soon' };
  if (diff <= 3)  return { label: diff + ' days left', cls: 'due-soon' };
  return { label: diff + ' days left', cls: 'due-ok' };
}

function renderTasks(tasks, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!tasks || tasks.length === 0) {
    el.innerHTML = '<p class="empty-msg">No tasks yet. Add one to set sail! 🌊</p>';
    return;
  }

  // Build HTML string for each task
  el.innerHTML = tasks.map(task => {
    const dueInfo = getDueDateInfo(task.due_date);
    const dueBadge = (!task.is_complete && dueInfo)
      ? `<span class="badge ${dueInfo.cls}">${dueInfo.label}</span>`
      : '';
    
    return `
    <div class="task-card ${task.is_complete ? 'done' : ''}">
      <div class="task-info">
        <h3 class="task-title ${task.is_complete ? 'striked' : ''}">${task.title}</h3>
        <div class="task-meta">
          <span class="badge subject">${task.subject || 'General'}</span>
          <span class="badge priority ${task.priority}">${task.priority}</span>
          ${task.due_date ? `<span class="badge due">📅 ${task.due_date}</span>` : ''}
          ${dueBadge}
        </div>
      </div>
      <div class="task-actions">
        <button onclick="toggleComplete('${task.id}', ${task.is_complete})"
          class="btn-icon ${task.is_complete ? 'btn-undo' : 'btn-done'}">
          ${task.is_complete ? '<i data-lucide="rotate-ccw"></i>' : '<i data-lucide="check"></i>'}
        </button>
        <button onclick="deleteTask('${task.id}')" class="btn-icon btn-delete"><i data-lucide="trash-2"></i></button>
      </div>
    </div>
  `}).join('');
  if (window.lucide) lucide.createIcons();
}

// ── 8. RENDER TASKS — parent view ────────────
function renderParentTasks(tasks, children) {
  const el = document.getElementById('parent-task-list');
  if (!el) return;

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
              <span><i data-lucide="${task.is_complete ? 'check-circle' : 'clock'}" style="width:16px;height:16px;stroke:${task.is_complete ? 'var(--accent)' : 'var(--text-soft)'}"></i></span>
            </div>
          `).join('')
        }
      </div>
    `;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

// ── 9. ADD TASK ───────────────────────────────
async function addTask() {
  const title    = document.getElementById('task-title').value.trim();
  const subject  = document.getElementById('task-subject').value.trim();
  const dueDate  = document.getElementById('task-due').value;
  const priority = document.getElementById('task-priority').value;

  if (!title) { await showCustomAlert('Enter a task title!', 'edit-3'); return; }

  const { error } = await supabaseClient.from('tasks').insert({
    user_id: currentUser.id,
    title, subject, priority,
    due_date: dueDate || null,
    is_complete: false
  });

  if (error) {
    await showCustomAlert('Failed to add task: ' + error.message, 'x-circle');
    return;
  }

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

function toggleDarkMode() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('darkMode', isDark);
  const btn = document.getElementById('dark-toggle-btn');
  btn.innerHTML = isDark
    ? '<i data-lucide="sun"></i>'
    : '<i data-lucide="moon"></i>';
  lucide.createIcons();
}

// ── 11. DELETE TASK ───────────────────────────
async function deleteTask(taskId) {
  const confirmed = await showCustomConfirm('Remove this task?', 'trash-2');
  if (!confirmed) return;
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
    message: 'SOS Alert!'
  });

  const btn = document.getElementById('sos-btn');
  btn.innerHTML = '<i data-lucide="check-circle"></i> Alert Sent!';
  btn.disabled = true;
  if (window.lucide) lucide.createIcons();
  setTimeout(() => {
    btn.innerHTML = '<i data-lucide="alert-triangle"></i> Send SOS';
    btn.disabled = false;
    if (window.lucide) lucide.createIcons();
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
  if (!el) return;

  if (!alerts || alerts.length === 0) {
    el.innerHTML = '<p class="empty-msg"><i data-lucide="shield-check" style="width:18px;height:18px;vertical-align:middle;margin-right:6px;"></i>No alerts. Crew is safe!</p>';
    if (window.lucide) lucide.createIcons();
    return;
  }
  el.innerHTML = alerts.map(a => `
    <div class="sos-card">
      <div class="sos-content">
        <span><i data-lucide="alert-octagon" style="width:18px;height:18px;vertical-align:middle;margin-right:6px;stroke:var(--primary);"></i><strong>${a.child_name}</strong> sent an alert</span>
        <span class="sos-time">${new Date(a.created_at).toLocaleString()}</span>
      </div>
      <button class="btn-icon btn-sos-delete" onclick="deleteSOS('${a.id}')" title="Dismiss Alert">
        <i data-lucide="x"></i>
      </button>
    </div>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

async function deleteSOS(alertId) {
  const { error } = await supabaseClient
    .from('sos_alerts')
    .delete()
    .eq('id', alertId);
  if (error) {
    console.error('Error deleting SOS alert:', error);
    return;
  }
  await loadSOSAlerts();
}

// ── 15. MAP — Leaflet.js ──────────────────────
function initMap(containerId) {
  try {
    const el = document.getElementById(containerId);
    if (!el) return;

    // Default to Chennai
    let lat = 13.0827;
    let lng = 80.2707;

    // Use current profile's lat/lng if we already have it from a previous load
    if (currentProfile && currentProfile.latitude) {
      lat = currentProfile.latitude;
      lng = currentProfile.longitude;
    }

    // Remove old map instance if it exists
    if (window.mapInstances && window.mapInstances[containerId]) {
      window.mapInstances[containerId].remove();
    }
    if (!window.mapInstances) window.mapInstances = {};

    const map = L.map(containerId, { attributionControl: false }).setView([lat, lng], 15);
    window.mapInstances[containerId] = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    const popupContent = `
      <div style="display:flex; align-items:center; gap:8px; font-family:'Nunito',sans-serif;">
        <span style="color:#E8503A; font-size:1.2rem;">📍</span>
        <span style="font-weight:700; color:#2C1810;">${currentProfile.name.toLowerCase()}'s Location</span>
      </div>
    `;

    L.marker([lat, lng])
      .addTo(map)
      .bindPopup(popupContent, {
        closeButton: true,
        className: 'custom-popup'
      })
      .openPopup();
  } catch (e) {
    console.error('Map failed to load:', e);
  }
}

function initParentMap(containerId, children) {
  try {
    const defaultLat = 13.0827, defaultLng = 80.2707;
    // Base map on the first child location or default
    const mapCenter = children[0]?.latitude ? [children[0].latitude, children[0].longitude] : [defaultLat, defaultLng];
    
    if (window.mapInstances && window.mapInstances[containerId]) {
      window.mapInstances[containerId].remove();
    }
    if (!window.mapInstances) window.mapInstances = {};
    
    const map = L.map(containerId, { attributionControl: false }).setView(mapCenter, 13);
    window.mapInstances[containerId] = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    children.forEach(child => {
      // Use real database coordinates if available, otherwise apply small random offset for demo
      const cLat = child.latitude || (defaultLat + (Math.random() - 0.5) * 0.01);
      const cLng = child.longitude || (defaultLng + (Math.random() - 0.5) * 0.01);

      const popupContent = `
        <div style="display:flex; align-items:center; gap:8px; font-family:'Nunito',sans-serif;">
          <span style="color:#E8503A; font-size:1.2rem;">📍</span>
          <span style="font-weight:700; color:#2C1810;">${child.name.toLowerCase()}'s Location</span>
        </div>
      `;

      L.marker([cLat, cLng])
        .addTo(map)
        .bindPopup(popupContent, {
          closeButton: true,
          className: 'custom-popup'
        });
    });
  } catch (e) {
    console.error('Parent map failed:', e);
  }
}

const AVATARS = ['🏴‍☠️','⚓','🧭','⚔️','🌊','🦁','🐉','🌟','🔥','👑'];

function openProfile() {
  document.getElementById('profile-avatar-display').textContent = currentProfile.avatar || '🏴‍☠️';
  document.getElementById('profile-name-display').textContent   = currentProfile.name;
  document.getElementById('profile-role-display').textContent   =
    currentProfile.role === 'parent' ? '⚓ Captain (Parent)' : '🏴‍☠️ Crew (Child)';
  document.getElementById('profile-email-display').textContent  = currentProfile.email;
  const picker = document.getElementById('avatar-picker');
  picker.innerHTML = AVATARS.map(e => `
    <div onclick="selectAvatar('${e}')"
      style="width:48px;height:48px;border-radius:50%;border:3px solid ${(currentProfile.avatar||'🏴‍☠️')===e?'#E8503A':'var(--border)'};
             font-size:1.5rem;cursor:pointer;display:flex;align-items:center;justify-content:center;
             background:var(--cream);transition:all 0.2s;">
      ${e}
    </div>
  `).join('');
  document.getElementById('profile-overlay').classList.remove('hidden');
}

function closeProfile() {
  document.getElementById('profile-overlay').classList.add('hidden');
}

async function selectAvatar(emoji) {
  try {
    // Optimistically update the UI first for a better experience
    currentProfile.avatar = emoji;
    const profileAvatar = document.getElementById('profile-avatar-display');
    if (profileAvatar) profileAvatar.textContent = emoji;
    
    const navAvatar = document.getElementById('nav-avatar');
    if (navAvatar) navAvatar.textContent = emoji;

    // Try to update the background database
    const { error } = await supabaseClient
      .from('profiles')
      .update({ avatar: emoji })
      .eq('id', currentUser.id);
    
    // If the 'avatar' column actually doesn't exist in Supabase yet,
    // we let it fail silently in the DB but keep it active for the current session.
    if (error) {
      console.warn('Avatar column might be missing in profiles table:', error.message);
      // We don't alert the user if it's just a schema mismatch, 
      // but we log it for the developer.
    }
    
    openProfile(); // re-render picker with new selection highlighted
  } catch (error) {
    console.error('selectAvatar extreme error:', error);
  }
}