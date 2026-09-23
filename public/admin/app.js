(() => {
  const API_URL = String(window.TRUHOOM_ADMIN_CONFIG?.API_URL || 'http://localhost:3000').replace(/\/$/, '');
  const storageKey = 'truhoom_admin_session';
  const $ = (id) => document.getElementById(id);
  let session = null;
  let dashboardData = { payouts: [], recentBookings: [] };

  const money = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
  const date = (value) => value ? new Date(value).toLocaleString('en-NG') : '—';
  const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const setLoading = (visible) => $('loading').classList.toggle('hidden', !visible);

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}), ...options.headers } });
    } catch {
      throw new Error(`Could not reach the Truhoom API at ${API_URL}.`);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path !== '/auth/login') signOut(false);
      throw new Error(data.error || 'The request failed.');
    }
    return data;
  }

  function saveSession(result) {
    session = { ...result.session, profile: result.profile };
    sessionStorage.setItem(storageKey, JSON.stringify(session));
  }

  function signOut(callApi = true) {
    const token = session?.access_token;
    session = null;
    sessionStorage.removeItem(storageKey);
    $('dashboard-view').classList.add('hidden');
    $('login-view').classList.remove('hidden');
    if (callApi && token) fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }

  function badge(value, success) {
    return node('span', `badge ${success ? 'success' : value === 'FAILED' ? 'danger' : ''}`, value);
  }

  function addCell(row, content, secondary) {
    const cell = node('td');
    if (content instanceof Node) cell.append(content); else cell.append(node('span', '', content));
    if (secondary) cell.append(node('small', '', secondary));
    row.append(cell);
    return cell;
  }

  function renderMetrics(summary) {
    const items = [
      ['Gross payments', money(summary.grossPayments)], ['Platform earnings', money(summary.platformEarnings)],
      ['Artisan liability', money(summary.artisanLiability)], ['Paid to artisans', money(summary.paidOut)],
      ['Paid bookings', summary.paid], ['Payouts needing attention', summary.pendingPayouts],
      ['All bookings', summary.bookings], ['Users / artisans', `${summary.users} / ${summary.artisans}`],
    ];
    $('metrics').replaceChildren(...items.map(([label, value]) => { const card = node('article', 'metric'); card.append(node('p', 'metric-label', label), node('strong', '', String(value))); return card; }));
  }

  function renderInsights(summary) {
    const takeRate = summary.grossPayments ? (summary.platformEarnings / summary.grossPayments) * 100 : 0;
    const completionRate = summary.bookings ? (summary.completed / summary.bookings) * 100 : 0;
    const payoutRate = summary.artisanLiability ? (summary.paidOut / summary.artisanLiability) * 100 : 0;
    const items = [['Platform take rate', takeRate], ['Booking completion', completionRate], ['Artisan payout progress', payoutRate]];
    $('insights').replaceChildren(...items.map(([label, value]) => {
      const card = node('article', 'insight'); const top = node('div', 'insight-top'); top.append(node('span', '', label), node('strong', '', `${Math.min(value, 100).toFixed(1)}%`));
      const track = node('div', 'progress'); const fill = node('span'); fill.style.width = `${Math.min(value, 100)}%`; track.append(fill); card.append(top, track); return card;
    }));
  }

  const includes = (value, query) => String(value || '').toLowerCase().includes(query);
  function filterPayouts() {
    const query = $('payout-search').value.trim().toLowerCase(); const status = $('payout-status').value;
    const items = dashboardData.payouts.filter((item) => (!status || item.payoutStatus === status) && (!query || [item.id, item.artisan?.fullName, item.service?.name, item.artisan?.payoutMethods?.[0]?.accountName].some((value) => includes(value, query))));
    renderPayouts(items);
  }

  function filterBookings() {
    const query = $('booking-search').value.trim().toLowerCase(); const status = $('booking-status').value;
    const items = dashboardData.recentBookings.filter((item) => (!status || item.status === status) && (!query || [item.id, item.customer?.fullName, item.artisan?.fullName, item.service?.name].some((value) => includes(value, query))));
    renderBookings(items);
  }

  function renderPayouts(items) {
    $('payout-empty').classList.toggle('hidden', items.length > 0);
    $('payout-rows').replaceChildren(...items.map((item) => {
      const row = node('tr');
      const method = item.artisan?.payoutMethods?.[0];
      addCell(row, `#${item.id}`, date(item.paidAt));
      addCell(row, item.artisan?.fullName || 'Unassigned', method ? `${method.accountName} · ${method.bankName} •••• ${method.accountLast4}` : 'No payout account');
      addCell(row, item.service.name); addCell(row, money(item.paymentAmount)); addCell(row, money(item.platformFee)); addCell(row, money(item.artisanNet));
      addCell(row, badge(item.payoutStatus, item.payoutStatus === 'PAID'));
      const actionCell = addCell(row, '');
      const canRelease = item.status === 'COMPLETED' && ['NOT_READY', 'READY', 'FAILED'].includes(item.payoutStatus) && method;
      if (canRelease) {
        const button = node('button', 'small-button', 'Release payout');
        button.addEventListener('click', async () => { button.disabled = true; button.textContent = 'Processing…'; try { await request(`/api/admin/payouts/${item.id}/release`, { method: 'POST' }); await loadDashboard(); } catch (error) { showPageError(error.message); button.disabled = false; button.textContent = 'Try again'; } });
        actionCell.replaceChildren(button);
      } else actionCell.replaceChildren(node('small', '', item.payoutStatus === 'PAID' ? date(item.paidOutAt) : method ? 'Awaiting completion' : 'Account required'));
      return row;
    }));
  }

  function renderBookings(items) {
    $('booking-empty').classList.toggle('hidden', items.length > 0);
    $('booking-rows').replaceChildren(...items.map((item) => {
      const row = node('tr'); addCell(row, `#${item.id}`); addCell(row, item.customer.fullName); addCell(row, item.artisan?.fullName || 'Unassigned'); addCell(row, item.service.name); addCell(row, badge(item.status, item.status === 'COMPLETED')); addCell(row, badge(item.paymentStatus, item.paymentStatus === 'PAID')); addCell(row, money(item.paymentAmount)); return row;
    }));
  }

  function showPageError(message) { $('page-error').textContent = message; $('page-error').classList.toggle('hidden', !message); }

  async function loadDashboard() {
    setLoading(true); showPageError('');
    try {
      const data = await request('/api/admin/dashboard');
      dashboardData = data; renderMetrics(data.summary); renderInsights(data.summary); filterPayouts(); filterBookings();
      $('updated-at').textContent = `Updated ${new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (error) { showPageError(error.message); } finally { setLoading(false); }
  }

  async function openDashboard() {
    if (session?.profile?.role?.name !== 'ADMIN' && session?.profile?.role !== 'ADMIN') { signOut(); throw new Error('This account does not have admin access.'); }
    $('login-view').classList.add('hidden'); $('dashboard-view').classList.remove('hidden');
    $('welcome').textContent = `Signed in as ${session.profile.fullName || session.profile.email}`;
    await loadDashboard();
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const button = $('login-button'); $('login-error').textContent = ''; button.disabled = true; button.textContent = 'Signing in…';
    try {
      const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('email').value.trim().toLowerCase(), password: $('password').value }) });
      if ((result.profile?.role?.name || result.profile?.role) !== 'ADMIN') throw new Error('This account does not have admin access.');
      saveSession(result); $('password').value = ''; await openDashboard();
    } catch (error) { session = null; sessionStorage.removeItem(storageKey); $('login-error').textContent = error.message; } finally { button.disabled = false; button.textContent = 'Sign in securely'; }
  });
  $('refresh').addEventListener('click', loadDashboard); $('logout').addEventListener('click', () => signOut());
  $('payout-search').addEventListener('input', filterPayouts); $('payout-status').addEventListener('change', filterPayouts);
  $('booking-search').addEventListener('input', filterBookings); $('booking-status').addEventListener('change', filterBookings);

  try { session = JSON.parse(sessionStorage.getItem(storageKey)); } catch { sessionStorage.removeItem(storageKey); }
  if (session?.access_token) openDashboard().catch((error) => { $('login-error').textContent = error.message; });
})();
