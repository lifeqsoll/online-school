const state = {
  accessToken: localStorage.getItem('os_access') || '',
  courseId: '',
  moduleId: '',
  lessonId: '',
  paymentId: '',
};

const out = document.getElementById('out');
const session = document.getElementById('session');

function show(data, ok = true) {
  out.style.color = ok ? '#e8eef4' : '#f07178';
  out.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function sync() {
  session.textContent = state.accessToken
    ? `token ${state.accessToken.slice(0, 16)}…`
    : 'no token';
  if (state.courseId) document.getElementById('courseId').value = state.courseId;
  if (state.moduleId) document.getElementById('moduleId').value = state.moduleId;
  if (state.lessonId) document.getElementById('lessonId').value = state.lessonId;
  if (state.paymentId) document.getElementById('paymentId').value = state.paymentId;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.accessToken && options.auth !== false) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }
  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    show(body || res.statusText, false);
    throw new Error('fail');
  }
  show(body ?? { ok: true, status: res.status });
  return body;
}

document.getElementById('login').onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  const data = await api('/auth/login', { method: 'POST', body: JSON.stringify(body), auth: false });
  state.accessToken = data.accessToken;
  localStorage.setItem('os_access', state.accessToken);
  localStorage.setItem('os_refresh', data.refreshToken || '');
  sync();
};

document.getElementById('create-course').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {
    title: fd.get('title'),
    priceCents: Number(fd.get('priceCents') || 0),
    isPublished: fd.get('isPublished') === 'on',
  };
  const data = await api('/courses', { method: 'POST', body: JSON.stringify(body) });
  state.courseId = data.id;
  sync();
};

document.getElementById('add-module').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  state.courseId = String(fd.get('courseId'));
  const data = await api(`/courses/${state.courseId}/modules`, {
    method: 'POST',
    body: JSON.stringify({ title: fd.get('title') }),
  });
  state.moduleId = data.id;
  sync();
};

document.getElementById('add-lesson').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  state.moduleId = String(fd.get('moduleId'));
  const data = await api(`/modules/${state.moduleId}/lessons`, {
    method: 'POST',
    body: JSON.stringify({ title: fd.get('title'), type: 'VIDEO', isPublished: true }),
  });
  state.lessonId = data.id;
  sync();
};

document.getElementById('ext-video').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  state.lessonId = String(fd.get('lessonId'));
  await api(`/lessons/${state.lessonId}/video/external`, {
    method: 'PATCH',
    body: JSON.stringify({ url: fd.get('url') }),
  });
};

document.getElementById('btn-enroll').onclick = () =>
  api(`/courses/${state.courseId || document.getElementById('courseId').value}/enroll`, {
    method: 'POST',
    body: '{}',
  });

document.getElementById('btn-checkout').onclick = async () => {
  const id = state.courseId || document.getElementById('courseId').value;
  const data = await api(`/courses/${id}/checkout`, { method: 'POST', body: '{}' });
  state.paymentId = data.payment?.id;
  sync();
};

document.getElementById('mock-confirm').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api('/payments/mock/confirm', {
    method: 'POST',
    body: JSON.stringify({ paymentId: fd.get('paymentId') }),
  });
};

document.getElementById('btn-playback').onclick = () =>
  api(`/lessons/${state.lessonId || document.getElementById('lessonId').value}/playback`);

document.getElementById('btn-list').onclick = () => api('/courses');

sync();
