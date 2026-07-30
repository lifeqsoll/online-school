const logEl = document.getElementById('log');
const sessionEl = document.getElementById('session');
let token = localStorage.getItem('accessToken') || '';

function log(x) {
  logEl.textContent =
    typeof x === 'string' ? x : JSON.stringify(x, null, 2);
}
function setToken(t) {
  token = t || '';
  if (t) localStorage.setItem('accessToken', t);
  sessionEl.textContent = token ? 'token set' : 'no token';
}
setToken(token);

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, { ...opts, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw { status: res.status, data };
  return data;
}

document.getElementById('login').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const j = await api('/auth/login', {
      method: 'POST',
      body: { email: fd.get('email'), password: fd.get('password') },
    });
    setToken(j.accessToken);
    log(j);
  } catch (err) {
    log(err);
  }
};

document.getElementById('topic').onsubmit = async (e) => {
  e.preventDefault();
  const courseId = document.getElementById('courseId').value;
  const fd = new FormData(e.target);
  try {
    log(
      await api(`/courses/${courseId}/topics`, {
        method: 'POST',
        body: { name: fd.get('name') },
      }),
    );
  } catch (err) {
    log(err);
  }
};

document.getElementById('btn-topics').onclick = async () => {
  const courseId = document.getElementById('courseId').value;
  try {
    log(await api(`/courses/${courseId}/topics`));
  } catch (err) {
    log(err);
  }
};

async function report(path) {
  const courseId = document.getElementById('courseId').value;
  try {
    log(await api(`/courses/${courseId}/analytics/${path}`));
  } catch (err) {
    log(err);
  }
}

document.getElementById('btn-radar').onclick = () => report('radar/me');
document.getElementById('btn-cold').onclick = () => report('cold-lessons');
document.getElementById('btn-struggle').onclick = () =>
  report('struggling-topics');
document.getElementById('btn-graph').onclick = () => report('graph');
