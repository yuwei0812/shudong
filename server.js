// =============================================================
//  🌳 树洞 · 悄悄话 —— 一个匿名情绪树洞
//  零依赖，只用 Node.js 内置模块
//  启动：node server.js
//  访问：http://localhost:8321
// =============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 8321;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
// 数据文件位置：默认在项目目录；部署到云平台时可指向持久化磁盘，例如 DATA_FILE=/data/data.json
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(ROOT, 'data.json');
// 删帖后台的口令：设置后，后台才能删除悄悄话；不设则关闭删帖功能
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// ---------- 可爱的匿名身份 ----------
const NICKNAMES = [
  '小蘑菇', '云朵', '星星', '小鹿', '海风', '月亮', '小熊', '柠檬', '山雀',
  '萤火虫', '松果', '布丁', '贝壳', '青柠', '小熊软糖', '棉花糖', '纸飞机',
  '小树苗', '晚风', '露珠', '麦田', '白鸽', '雪球', '桃子', '桂花', '银河',
  '小鲸鱼', '蒲公英', '小狐狸', '薄荷', '汽水', '月亮邮差', '树袋熊', '萤火',
];
const AVATARS = [
  '🐻', '🐰', '🦊', '🐱', '🐧', '🐨', '🐹', '🦉', '🐳', '🌙', '⭐', '🌿',
  '🍄', '🌸', '🌻', '🍀', '🌊', '☁️', '🕊️', '🍑', '🍋', '🧸', '🫧', '🪐', '🍃',
];
const TAGS = ['疑惑', '抱怨', '心事', '开心', '秘密', '其他'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const hashIp = (ip) =>
  crypto.createHash('sha256').update('shudong::' + ip).digest('hex').slice(0, 24);

// ---------- 数据存取 ----------
let data;
try {
  data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!data || !Array.isArray(data.posts) || typeof data.nextId !== 'number') {
    throw new Error('bad data');
  }
} catch {
  // 第一次开门：放几颗欢迎的小种子，让树洞不那么冷清
  const now = Date.now();
  data = {
    nextId: 3,
    posts: [
      {
        id: 1,
        tag: '开心',
        content: '大家好呀，我是树洞本洞 🌳\n欢迎把心事放进这里，有人看见，就会有人回应。\n这里没有名字，只有温柔。',
        nickname: '树洞本洞', avatar: '🌳', hugs: 6, hugIPs: [],
        createdAt: now - 3600e3,
        replies: [
          {
            nickname: '小蘑菇', avatar: '🍄',
            content: '第一个来报道！今天天气很好，想把好心情分给大家 🌞',
            createdAt: now - 1800e3,
          },
        ],
      },
      {
        id: 2,
        tag: '疑惑',
        content: '第一次来，想问一下：把烦恼说出来，真的会好一点吗？',
        nickname: '蒲公英', avatar: '🍃', hugs: 2, hugIPs: [],
        createdAt: now - 900e3, replies: [],
      },
    ],
  };
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('数据保存失败：', e.message);
  }
}

// ---------- 简单的频率限制（防止刷屏） ----------
const lastAction = new Map(); // ip -> { key: timestamp }
function tooOften(ip, key, gapMs) {
  const now = Date.now();
  let bucket = lastAction.get(ip);
  if (!bucket) {
    bucket = {};
    lastAction.set(ip, bucket);
  }
  if (bucket[key] && now - bucket[key] < gapMs) return true;
  bucket[key] = now;
  if (lastAction.size > 5000) lastAction.clear();
  return false;
}

// ---------- 工具 ----------
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(res, pathname) {
  const file = pathname === '/' ? '/index.html' : pathname;
  const safe = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, safe);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('403');
  }
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 · 这页被风吹走了 🍃');
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

// 去掉控制字符、修剪首尾空白（保留换行，让心事可以分段）
function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function getIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const ip = getIp(req);
  const method = req.method;

  try {
    // ---- 静态页面 ----
    if (method === 'GET' && !url.pathname.startsWith('/api/')) {
      return serveStatic(res, url.pathname);
    }

    // ---- 健康检查（云平台用） ----
    if (method === 'GET' && url.pathname === '/api/health') {
      return sendJSON(res, 200, { ok: true, uptime: process.uptime() });
    }

    // ---- 获取树洞里的悄悄话 ----
    if (method === 'GET' && url.pathname === '/api/posts') {
      const tag = url.searchParams.get('tag') || '';
      const ipHash = hashIp(ip);
      let posts = data.posts;
      if (tag && tag !== '全部') posts = posts.filter((p) => p.tag === tag);
      posts = [...posts].sort((a, b) => b.createdAt - a.createdAt);
      const view = posts.map((p) => ({
        id: p.id,
        tag: p.tag,
        content: p.content,
        nickname: p.nickname,
        avatar: p.avatar,
        hugs: p.hugs || 0,
        createdAt: p.createdAt,
        hugged: (p.hugIPs || []).includes(ipHash),
        replies: p.replies.map((r) => ({
          nickname: r.nickname,
          avatar: r.avatar,
          content: r.content,
          createdAt: r.createdAt,
        })),
      }));
      return sendJSON(res, 200, { posts: view, total: data.posts.length });
    }

    // ---- 投递悄悄话 ----
    if (method === 'POST' && url.pathname === '/api/posts') {
      if (tooOften(ip, 'post', 15000)) {
        return sendJSON(res, 429, { error: '你投得太快啦，先歇一小会儿，树洞一直都在 🌿' });
      }
      const body = JSON.parse((await readBody(req)) || '{}');
      const content = cleanText(body.content, 500);
      const tag = TAGS.includes(body.tag) ? body.tag : '心事';
      let nickname = cleanText(body.nickname, 10);
      if (!content) {
        return sendJSON(res, 400, { error: '给树洞写点什么吧，一句话也好 🌱' });
      }
      if (!nickname) nickname = pick(NICKNAMES);
      const post = {
        id: data.nextId++,
        tag,
        content,
        nickname,
        avatar: pick(AVATARS),
        hugs: 0,
        hugIPs: [],
        createdAt: Date.now(),
        replies: [],
      };
      data.posts.push(post);
      if (data.posts.length > 2000) data.posts = data.posts.slice(-1500); // 树洞也要留出空间
      save();
      return sendJSON(res, 200, { ok: true, post: { ...post, hugged: false } });
    }

    // ---- 回应一条悄悄话 ----
    let m = url.pathname.match(/^\/api\/posts\/(\d+)\/replies$/);
    if (method === 'POST' && m) {
      if (tooOften(ip, 'reply', 8000)) {
        return sendJSON(res, 429, { error: '回应得太快啦，温柔要慢慢说 💌' });
      }
      const post = data.posts.find((p) => p.id === Number(m[1]));
      if (!post) return sendJSON(res, 404, { error: '这条悄悄话已经随风飘走了 🍃' });
      const body = JSON.parse((await readBody(req)) || '{}');
      const content = cleanText(body.content, 300);
      if (!content) return sendJSON(res, 400, { error: '回应不能是空的哦 💭' });
      const reply = {
        nickname: cleanText(body.nickname, 10) || pick(NICKNAMES),
        avatar: pick(AVATARS),
        content,
        createdAt: Date.now(),
      };
      post.replies.push(reply);
      save();
      return sendJSON(res, 200, { ok: true, reply });
    }

    // ---- 抱抱一条悄悄话 ----
    m = url.pathname.match(/^\/api\/posts\/(\d+)\/hug$/);
    if (method === 'POST' && m) {
      if (tooOften(ip, 'hug', 3000)) {
        return sendJSON(res, 429, { error: '一个一个抱，都会抱到的 🤗' });
      }
      const post = data.posts.find((p) => p.id === Number(m[1]));
      if (!post) return sendJSON(res, 404, { error: '这条悄悄话已经随风飘走了 🍃' });
      const ipHash = hashIp(ip);
      if ((post.hugIPs || []).includes(ipHash)) {
        return sendJSON(res, 200, { ok: true, hugs: post.hugs, hugged: true, again: true });
      }
      post.hugIPs = post.hugIPs || [];
      post.hugIPs.push(ipHash);
      post.hugs = (post.hugs || 0) + 1;
      save();
      return sendJSON(res, 200, { ok: true, hugs: post.hugs, hugged: true });
    }

    // ---- 删帖（需要管理员口令，公网运营时的审核工具） ----
    m = url.pathname.match(/^\/api\/posts\/(\d+)$/);
    if (method === 'DELETE' && m) {
      if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
        return sendJSON(res, 403, { error: '没有权限删帖哦 🚫' });
      }
      const idx = data.posts.findIndex((p) => p.id === Number(m[1]));
      if (idx < 0) return sendJSON(res, 404, { error: '这条悄悄话已经没有了' });
      data.posts.splice(idx, 1);
      save();
      return sendJSON(res, 200, { ok: true });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 · 这页被风吹走了 🍃');
  } catch (e) {
    console.error(e);
    sendJSON(res, 400, { error: '树洞打了个小盹儿，稍后再试试 😴' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  🌳 树洞 · 悄悄话 已经开门营业啦');
  console.log(`     本机访问：   http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`     局域网访问： http://${net.address}:${PORT}  （发给朋友一起玩）`);
      }
    }
  }
  console.log('');
  if (process.env.DATA_FILE) console.log(`     数据文件：   ${DATA_FILE}`);
  if (ADMIN_KEY) {
    console.log('     删帖后台：   http://localhost:' + PORT + '/admin.html');
  } else {
    console.log('     删帖后台：   未启用（设置环境变量 ADMIN_KEY 后生效）');
  }
  console.log('');
  console.log('  按 Ctrl + C 可以关门休息。');
  console.log('');
});
