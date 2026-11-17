// 🌳 树洞 · 悄悄话 —— 前端逻辑

const TAGS = [
  { key: '疑惑', icon: '💭', color: '#8ec5ff' },
  { key: '抱怨', icon: '🌧️', color: '#a5b4fc' },
  { key: '心事', icon: '💌', color: '#f7a58f' },
  { key: '开心', icon: '🌞', color: '#ffd166' },
  { key: '秘密', icon: '🤫', color: '#c3a6f5' },
  { key: '其他', icon: '🌱', color: '#7fc8a9' },
];
const tagMeta = {};
TAGS.forEach((t) => (tagMeta[t.key] = t));

const $ = (s) => document.querySelector(s);
const contentEl = $('#content');
const charCountEl = $('#charCount');
const nicknameEl = $('#nickname');
const postBtn = $('#postBtn');
const listEl = $('#list');

let posts = [];
let currentTag = '全部';
let selectedTag = '心事';
const openReplies = new Set();
let lastSig = '';

// ---------- 小工具 ----------
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  if (!res.ok) throw new Error((json && json.error) || '树洞打了个小盹儿，稍后再试试 😴');
  return json;
}

// ---------- 渲染 ----------
function sig() {
  return posts.map((p) => `${p.id}:${p.hugs}:${p.replies.length}`).join('|') + '::' + currentTag;
}

function postCard(p) {
  const meta = tagMeta[p.tag] || tagMeta['其他'];
  const open = openReplies.has(p.id);
  const replies = p.replies
    .map(
      (r) => `
    <div class="reply">
      <span class="avatar">${r.avatar}</span>
      <div class="reply-body">
        <div class="reply-head">
          <span class="nick">${escapeHtml(r.nickname)}</span>
          <span class="time">${timeAgo(r.createdAt)}</span>
        </div>
        <p class="reply-content">${escapeHtml(r.content)}</p>
      </div>
    </div>`
    )
    .join('');
  const replyLabel = open
    ? '收起回应'
    : `回应${p.replies.length ? ` ×${p.replies.length}` : ''}`;
  return `
  <article class="card post">
    <div class="post-head">
      <span class="avatar">${p.avatar}</span>
      <div>
        <div class="nick">${escapeHtml(p.nickname)}</div>
        <div class="time">${timeAgo(p.createdAt)}</div>
      </div>
      <span class="tag-badge" style="background:${meta.color}">${meta.icon} ${p.tag}</span>
    </div>
    <p class="post-content">${escapeHtml(p.content)}</p>
    <div class="post-actions">
      <button class="hug-btn${p.hugged ? ' hugged' : ''}" data-hug="${p.id}">🤗 抱抱 ×${p.hugs}</button>
      <button class="reply-toggle${open ? ' open' : ''}" data-toggle="${p.id}">💬 ${replyLabel}</button>
    </div>
    ${
      open
        ? `<div class="replies">${replies}</div>
      <div class="reply-box open">
        <input class="reply-input" maxlength="300" placeholder="轻轻回应一句……" />
        <button data-send="${p.id}">送出 💌</button>
      </div>`
        : ''
    }
  </article>`;
}

function renderList() {
  if (!posts.length) {
    listEl.innerHTML =
      currentTag === '全部'
        ? '<div class="empty"><span class="big">🌙</span>树洞里安安静静的<br>做第一个说话的人吧</div>'
        : '<div class="empty"><span class="big">🍃</span>这个树杈上还没有悄悄话<br>换个话题看看吧</div>';
    return;
  }
  listEl.innerHTML = posts.map(postCard).join('');
  requestAnimationFrame(() => {
    const input = listEl.querySelector('.reply-box.open .reply-input');
    if (input) input.focus();
  });
}

async function loadPosts() {
  const res = await api(`/api/posts?tag=${encodeURIComponent(currentTag)}`);
  posts = res.posts;
  const s = sig();
  if (s !== lastSig) {
    lastSig = s;
    renderList();
  }
}

// ---------- 互动 ----------
function burstHearts(btn) {
  const box = btn.closest('.post-actions');
  if (!box) return;
  const rect = btn.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  for (let i = 0; i < 5; i++) {
    const h = document.createElement('span');
    h.className = 'heart';
    h.textContent = ['💗', '💕', '💖'][i % 3];
    h.style.left = `${rect.left - boxRect.left + 10 + Math.random() * Math.max(rect.width - 20, 1)}px`;
    h.style.bottom = '6px';
    h.style.animationDelay = `${i * 60}ms`;
    box.appendChild(h);
    setTimeout(() => h.remove(), 1200);
  }
}

async function hugPost(id, btn) {
  if (btn.classList.contains('hugged')) return;
  btn.disabled = true;
  try {
    const res = await api(`/api/posts/${id}/hug`, { method: 'POST' });
    if (res.again) {
      toast('已经抱过啦，心意收到了哦 🤗');
    } else {
      burstHearts(btn);
      toast('收到你的抱抱啦 🤗');
    }
    await loadPosts();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function sendReply(id, btn) {
  const box = btn.closest('.reply-box');
  const input = box.querySelector('.reply-input');
  const content = input.value.trim();
  if (!content) return toast('回应不能是空的哦 💭');
  btn.disabled = true;
  try {
    await api(`/api/posts/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    input.value = '';
    toast('回应已送出，谢谢你的温柔 💌');
    await loadPosts();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
}

// 事件委托：抱抱 / 展开回应 / 送出回应
listEl.addEventListener('click', (e) => {
  const hugBtn = e.target.closest('[data-hug]');
  if (hugBtn) return hugPost(Number(hugBtn.dataset.hug), hugBtn);

  const toggle = e.target.closest('[data-toggle]');
  if (toggle) {
    const id = Number(toggle.dataset.toggle);
    openReplies.has(id) ? openReplies.delete(id) : openReplies.add(id);
    return renderList();
  }

  const send = e.target.closest('[data-send]');
  if (send) return sendReply(Number(send.dataset.send), send);
});

listEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('reply-input')) {
    const send = e.target.closest('.reply-box').querySelector('[data-send]');
    if (send) sendReply(Number(send.dataset.send), send);
  }
});

// ---------- 投递 ----------
contentEl.addEventListener('input', () => {
  charCountEl.textContent = `${contentEl.value.length} / 500`;
});

postBtn.addEventListener('click', async () => {
  const content = contentEl.value.trim();
  if (!content) return toast('给树洞写点什么吧，一句话也好 🌱');
  postBtn.disabled = true;
  try {
    const res = await api('/api/posts', {
      method: 'POST',
      body: JSON.stringify({
        content,
        tag: selectedTag,
        nickname: nicknameEl.value.trim(),
      }),
    });
    contentEl.value = '';
    charCountEl.textContent = '0 / 500';
    localStorage.setItem('shudong_nick', res.post.nickname);
    nicknameEl.value = res.post.nickname;
    toast(`已投进树洞，你的代号是「${res.post.nickname}」${res.post.avatar}`);
    setFilter('全部');
    await loadPosts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    toast(err.message);
  } finally {
    postBtn.disabled = false;
  }
});

// ---------- 标签选择与筛选 ----------
function initTagPicker() {
  const el = $('#tagPicker');
  const paint = () => {
    el.querySelectorAll('.tag').forEach((b) => {
      const on = b.dataset.tag === selectedTag;
      b.classList.toggle('on', on);
      b.style.background = on ? tagMeta[b.dataset.tag].color : '';
      b.style.color = on ? '#fff' : '';
    });
  };
  el.innerHTML = TAGS.map(
    (t) => `<button class="tag" data-tag="${t.key}">${t.icon} ${t.key}</button>`
  ).join('');
  paint();
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tag]');
    if (!btn) return;
    selectedTag = btn.dataset.tag;
    paint();
  });
}

function setFilter(key) {
  currentTag = key;
  document
    .querySelectorAll('.filter')
    .forEach((b) => b.classList.toggle('on', b.dataset.filter === key));
}

function initFilters() {
  const el = $('#filters');
  const items = ['全部', ...TAGS.map((t) => t.key)];
  el.innerHTML = items
    .map(
      (k) =>
        `<button class="filter${currentTag === k ? ' on' : ''}" data-filter="${k}">${
          k === '全部' ? '🌳 全部' : `${tagMeta[k].icon} ${k}`
        }</button>`
    )
    .join('');
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn || btn.dataset.filter === currentTag) return;
    setFilter(btn.dataset.filter);
    listEl.innerHTML = '<div class="empty"><span class="big">🫧</span>正在听风的声音……</div>';
    try {
      await loadPosts();
    } catch (err) {
      toast(err.message);
    }
  });
}

// ---------- 启动 ----------
(async function init() {
  const saved = localStorage.getItem('shudong_nick');
  if (saved) nicknameEl.value = saved;
  initTagPicker();
  initFilters();
  listEl.innerHTML = '<div class="empty"><span class="big">🫧</span>正在听风的声音……</div>';
  try {
    await loadPosts();
  } catch (err) {
    listEl.innerHTML = `<div class="empty"><span class="big">😴</span>树洞睡着了<br>${escapeHtml(err.message)}</div>`;
  }
  // 每 30 秒轻轻看一眼有没有新的话
  setInterval(() => loadPosts().catch(() => {}), 30000);
})();

$('#refreshBtn').addEventListener('click', async () => {
  try {
    await loadPosts();
    toast('树洞安好，一切如常 🌿');
  } catch (err) {
    toast(err.message);
  }
});
