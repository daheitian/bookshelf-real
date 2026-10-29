// 静态版适配层：把 app.js 里的 /api/* 请求接到导出的真实书架数据上。
// 本人真实书架的静态快照，没有服务端；页面逻辑与正式版完全一致。
(function () {
  // 静态站没有服务端可填 Key，别在首屏弹「换成你自己的书房」
  try {
    localStorage.setItem('bookshelf.setupSeen', '1');
  } catch (err) {
    /* 隐私模式下 localStorage 不可写，忽略 */
  }

  const LIB = window.__REAL || { books: [], categories: [] };
  const NB = window.__REAL_NB || {};
  const origFetch = window.fetch.bind(window);

  // 笔记按 id 分 16 片，点开某本书才拉那一片（和 tools/export-real.mjs 的算法必须一致）
  const SHARDS = 16;
  const shardOf = (id) => {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % SHARDS;
  };
  const shardCache = {};
  async function loadShard(i) {
    if (shardCache[i]) return shardCache[i];
    try {
      const r = await origFetch(new URL('notes/' + i + '.json', location.href).href);
      shardCache[i] = r.ok ? await r.json() : {};
    } catch (err) {
      shardCache[i] = {};
    }
    return shardCache[i];
  }

  const reply = (obj, status) =>
    Promise.resolve(
      new Response(JSON.stringify(obj), {
        status: status || 200,
        headers: { 'content-type': 'application/json' },
      })
    );

  const paramOf = (url, k) => {
    const m = url.match(new RegExp('[?&]' + k + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  };

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];

    // scope 用 owner：静态快照就是房主本人的书房，别走 demo 那套提示
    if (path === '/api/library') return reply(Object.assign({}, LIB, { scope: 'owner' }));
    if (path === '/api/status') return reply({ ok: true, scope: 'owner', demo: false, weread: false });
    if (path === '/api/nb') return reply(NB);

    if (path === '/api/notes') {
      const id = paramOf(url, 'id');
      const shard = await loadShard(shardOf(id));
      const pack = shard[id] || { marks: [], thoughts: [] };
      const b = (LIB.books || []).find((x) => x.id === id);
      // 左页的出版信息：静态快照里只有推荐值，其余留空
      const info = b && b.rating ? { rating: Number(b.rating) * 10, ratingCount: b.ratingCount || 0 } : null;
      return reply({ bookId: id, marks: pack.marks || [], thoughts: pack.thoughts || [], info });
    }

    // 静态快照里进度是导出那一刻的，不再实时刷新
    if (path === '/api/progress') {
      const id = paramOf(url, 'id');
      const b = (LIB.books || []).find((x) => x.id === id);
      return reply({ progress: b ? { progress: b.progress, updateTime: b.readAt ? Math.round(b.readAt / 1000) : 0 } : null });
    }

    if (path === '/api/me')
      return reply({ ok: false, error: '这是静态快照，不支持接入微信读书' });
    if (path === '/api/cover') return reply({}, 404);
    return origFetch(input, init);
  };

  // 点房间名会弹出「填 Key 换书房」，静态版拦掉，别让人白填一遍
  document.addEventListener(
    'click',
    function (e) {
      const t = e.target;
      if (t && t.closest && t.closest('#roomOpen, #roomName')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );

  document.addEventListener('DOMContentLoaded', function () {
    const c = document.querySelector('.credit');
    if (c) c.textContent = '静态快照 · 数据导出于 ' + (LIB.generatedAt || '').slice(0, 10);
  });
})();
