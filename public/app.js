const API = '';

const state = {
  accessToken: localStorage.getItem('os_access') || '',
  refreshToken: localStorage.getItem('os_refresh') || '',
};

const out = document.getElementById('out');
const sessionMeta = document.getElementById('session-meta');
const healthEl = document.getElementById('health');

function saveTokens() {
  localStorage.setItem('os_access', state.accessToken || '');
  localStorage.setItem('os_refresh', state.refreshToken || '');
  renderSession();
}

function renderSession() {
  sessionMeta.textContent = JSON.stringify(
    {
      accessToken: state.accessToken
        ? `${state.accessToken.slice(0, 24)}…`
        : null,
      refreshToken: state.refreshToken
        ? `${state.refreshToken.slice(0, 24)}…`
        : null,
    },
    null,
    2,
  );
}

function show(data, ok = true) {
  out.style.color = ok ? '#e8eef4' : '#f07178';
  out.textContent =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (state.accessToken && options.auth !== false) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const err = body || { statusCode: res.status, message: res.statusText };
    show(err, false);
    throw Object.assign(new Error('request failed'), { body: err, status: res.status });
  }

  show(body ?? { status: res.status, ok: true });
  return body;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

document.getElementById('form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = formData(e.target);
  const data = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
  state.accessToken = data.accessToken;
  state.refreshToken = data.refreshToken;
  saveTokens();
});

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = formData(e.target);
  const data = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
  state.accessToken = data.accessToken;
  state.refreshToken = data.refreshToken;
  saveTokens();
});

document.getElementById('btn-me').addEventListener('click', () =>
  api('/users/me'),
);

document.getElementById('btn-refresh').addEventListener('click', async () => {
  const data = await api('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: state.refreshToken }),
    auth: false,
  });
  state.accessToken = data.accessToken;
  state.refreshToken = data.refreshToken;
  saveTokens();
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await api('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: state.refreshToken }),
  });
  state.accessToken = '';
  state.refreshToken = '';
  saveTokens();
});

document.getElementById('btn-admin-users').addEventListener('click', () =>
  api('/admin/users'),
);

document.getElementById('form-forgot').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = formData(e.target);
  const data = await api('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
  if (data.resetToken) {
    document.querySelector('#form-reset [name=token]').value = data.resetToken;
  }
});

document.getElementById('form-reset').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = formData(e.target);
  await api('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
});

document.getElementById('form-impersonate').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = formData(e.target);
  const data = await api('/auth/impersonate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  state.accessToken = data.accessToken;
  saveTokens();
});

document.getElementById('btn-stop-imp').addEventListener('click', async () => {
  const data = await api('/auth/impersonate/stop', { method: 'POST', body: '{}' });
  state.accessToken = data.accessToken;
  saveTokens();
});

async function checkHealth() {
  try {
    const data = await fetch(`${API}/health`).then((r) => r.json());
    const ok = data.status === 'ok';
    healthEl.textContent = ok
      ? `health ok · pg ${data.postgres} · redis ${data.redis}`
      : `degraded · ${JSON.stringify(data)}`;
    healthEl.className = `pill ${ok ? 'ok' : 'bad'}`;
  } catch (err) {
    healthEl.textContent = 'API offline';
    healthEl.className = 'pill bad';
  }
}

renderSession();
checkHealth();
setInterval(checkHealth, 15000);
