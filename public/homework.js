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
  if (opts.body && !(opts.body instanceof FormData)) {
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
      body: {
        email: fd.get('email'),
        password: fd.get('password'),
      },
    });
    setToken(j.accessToken);
    log(j);
  } catch (err) {
    log(err);
  }
};

document.getElementById('create-asg').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const courseId = fd.get('courseId');
  try {
    const j = await api(`/courses/${courseId}/assignments`, {
      method: 'POST',
      body: {
        scope: 'LESSON',
        lessonId: fd.get('lessonId'),
        title: fd.get('title'),
        maxXp: Number(fd.get('maxXp')),
        isPublished: fd.get('isPublished') === 'on',
        questions: [
          {
            type: 'CHOICE',
            prompt: '2+2?',
            points: 5,
            options: [
              { id: 'a', text: '4' },
              { id: 'b', text: '5' },
            ],
            correctKeys: ['a'],
          },
          {
            type: 'SHORT',
            prompt: 'Answer',
            points: 5,
            shortMatch: 'NUMBER',
            correctKeys: ['42'],
            numberTolerance: 0,
          },
        ],
      },
    });
    document.getElementById('assignmentId').value = j.id;
    log(j);
  } catch (err) {
    log(err);
  }
};

document.getElementById('submit-asg').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const assignmentId = fd.get('assignmentId');
  try {
    const detail = await api(`/assignments/${assignmentId}`);
    const qs = detail.questions || [];
    const choiceQ = qs.find((q) => q.type === 'CHOICE');
    const shortQ = qs.find((q) => q.type === 'SHORT');
    const sub = await api(`/assignments/${assignmentId}/submissions`, {
      method: 'POST',
      body: {},
    });
    const answers = [];
    if (choiceQ) answers.push({ questionId: choiceQ.id, value: [fd.get('choice')] });
    if (shortQ) answers.push({ questionId: shortQ.id, value: fd.get('short') });
    await api(`/submissions/${sub.id}`, {
      method: 'PATCH',
      body: { answers },
    });
    const done = await api(`/submissions/${sub.id}/submit`, { method: 'POST' });
    document.getElementById('submissionId').value = done.id;
    log(done);
  } catch (err) {
    log(err);
  }
};

document.getElementById('btn-xp').onclick = async () => {
  const courseId = document.getElementById('courseId').value;
  try {
    log(await api(`/courses/${courseId}/xp/me`));
  } catch (err) {
    log(err);
  }
};

document.getElementById('btn-lb').onclick = async () => {
  const courseId = document.getElementById('courseId').value;
  try {
    log(await api(`/courses/${courseId}/leaderboard`));
  } catch (err) {
    log(err);
  }
};

document.getElementById('btn-queue').onclick = async () => {
  const courseId = document.getElementById('courseId').value;
  try {
    log(
      await api(`/courses/${courseId}/submissions?status=PENDING_REVIEW`),
    );
  } catch (err) {
    log(err);
  }
};

document.getElementById('grade').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    log(
      await api(`/submissions/${fd.get('submissionId')}/grade`, {
        method: 'POST',
        body: {
          answers: [
            {
              questionId: fd.get('questionId'),
              pointsAwarded: Number(fd.get('points')),
            },
          ],
        },
      }),
    );
  } catch (err) {
    log(err);
  }
};
