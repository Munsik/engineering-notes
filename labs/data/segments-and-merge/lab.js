// Engineering Notes - data/01, data/02 실험 스크립트
//
// Kibana에 로그인한 브라우저 탭의 개발자 도구 콘솔(F12 > Console)에 붙여 넣어 실행합니다.
// 요청은 Kibana Dev Tools와 같은 console proxy(/api/console/proxy)로 보냅니다.
// 실험 인덱스 이름은 모두 segments-lab- 으로 시작합니다. 끝나면 cleanup()으로 지웁니다.
//
// 결과 수치는 results/ 폴더에 있습니다. 2026-11-25, Elastic Cloud Hosted 9.5.5
// (hot node 2대, 노드당 RAM 8GB, JVM heap 4GB, vCPU 2)에서 실행했습니다.

// ---------- 공통 helper ----------

window.es = async (method, path, body, raw) => {
  const r = await fetch('/api/console/proxy?path=' + encodeURIComponent(path) + '&method=' + method, {
    method: 'POST',
    headers: {
      'kbn-xsrf': 'true',
      'x-elastic-internal-origin': 'Kibana',
      'Content-Type': raw ? 'application/x-ndjson' : 'application/json',
    },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch (e) { j = t; }
  return { status: r.status, body: j };
};

window.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 같은 seed면 같은 문서가 나오는 synthetic 로그 생성기
window.mkRng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
window.WORDS = 'connection timeout request completed user login failed retry upstream cache miss hit order payment queue consumer lag disk write read latency session token refresh gateway backend service started stopped error warning'.split(' ');

window.genDocs = (start, n, seed, opts = {}) => {
  const r = mkRng(seed);
  const out = [];
  const base = Date.parse('2026-11-01T00:00:00Z');
  for (let i = start; i < start + n; i++) {
    const msg = Array.from({ length: 18 + Math.floor(r() * 14) }, () => WORDS[Math.floor(r() * WORDS.length)]).join(' ');
    const d = {
      [opts.tsField || '@timestamp']: new Date(base + i * 100).toISOString(),
      host: { name: 'host-' + String(Math.floor(r() * 50)).padStart(2, '0') },
      service: { name: ['checkout', 'cart', 'search', 'auth', 'catalog'][Math.floor(r() * 5)] },
      log: { level: r() < 0.9 ? 'info' : r() < 0.7 ? 'warn' : 'error' },
      http: { response: { status_code: r() < 0.95 ? 200 : [404, 500, 503][Math.floor(r() * 3)] } },
      event: { duration: Math.floor(r() * 500000) },
      message: msg,
    };
    if (opts.version !== undefined) d.round = opts.version;
    out.push(d);
  }
  return out;
};

// batch 건씩 _bulk로 보냅니다. ids:true면 _id를 0부터 순서대로 붙입니다(같은 id로 다시 보내면 update).
// console proxy는 요청 본문 크기에 제한이 있어서 batch를 2,000건(약 0.7MB)으로 둡니다. 5,000건(약 1.8MB)은 실패했습니다.
window.bulkLoad = async (index, total, batch, opts = {}) => {
  const t0 = performance.now();
  let errors = 0;
  for (let s = 0; s < total; s += batch) {
    const docs = genDocs(s + (opts.offset || 0), Math.min(batch, total - s), (opts.seed || 42) + s, opts);
    const nd = docs.map((d, k) => JSON.stringify(opts.ids ? { index: { _id: String(s + k) } } : { index: {} }) + '\n' + JSON.stringify(d)).join('\n') + '\n';
    const r = await es('POST', '/' + index + '/_bulk', nd, true);
    if (r.status !== 200 || r.body.errors) errors++;
    if (opts.onBatch) await opts.onBatch(s + batch);
  }
  return { ms: Math.round(performance.now() - t0), errors };
};

// primary 기준 통계와 _cat/segments 요약
window.idxStats = async (index) => {
  const s = await es('GET', '/' + index + '/_stats/docs,store,refresh,flush,merge,segments,indexing?filter_path=indices.*.primaries');
  const p = Object.values(s.body.indices)[0].primaries;
  const seg = await es('GET', '/_cat/segments/' + index + '?format=json&h=segment,generation,docs.count,docs.deleted,size,committed,searchable,compound');
  return {
    docs: p.docs.count, deleted: p.docs.deleted, store: p.store.size_in_bytes,
    refresh_total: p.refresh.total, refresh_external: p.refresh.external_total,
    flush_total: p.flush.total, flush_periodic: p.flush.periodic,
    merges_total: p.merges.total, merges_docs: p.merges.total_docs, merges_size: p.merges.total_size_in_bytes,
    merges_throttled_ms: p.merges.total_throttled_time_in_millis,
    seg_count_stats: p.segments.count, index_time_ms: p.indexing.index_time_in_millis, throttle_ms: p.indexing.throttle_time_in_millis,
    cat_segments: seg.body.length,
    searchable: seg.body.filter((x) => x.searchable === 'true').length,
    committed: seg.body.filter((x) => x.committed === 'true').length,
    compound: seg.body.filter((x) => x.compound === 'true').length,
  };
};

window.LAB_MAPPING = {
  properties: {
    '@timestamp': { type: 'date' },
    host: { properties: { name: { type: 'keyword' } } },
    service: { properties: { name: { type: 'keyword' } } },
    log: { properties: { level: { type: 'keyword' } } },
    http: { properties: { response: { properties: { status_code: { type: 'short' } } } } },
    event: { properties: { duration: { type: 'long' } } },
    message: { type: 'text' },
    round: { type: 'integer' },
  },
};
// 시간 필드 이름만 ts로 바꾼 매핑. @timestamp가 없으므로 TieredMergePolicy가 적용됩니다.
window.LAB_MAPPING_TS = JSON.parse(JSON.stringify(LAB_MAPPING));
delete LAB_MAPPING_TS.properties['@timestamp'];
LAB_MAPPING_TS.properties.ts = { type: 'date' };

// store 통계는 기본 10초 동안 캐시됩니다. 측정 전에 15초 기다립니다.
const SETTLE = 15000;

// ---------- 실험 A: refresh_interval ----------
// 같은 문서 100만 건을 refresh_interval만 바꿔 적재합니다.
// default(미설정)는 인덱스를 만들고 40초 기다려 search idle 상태가 된 뒤 적재합니다.
// suffix를 주면 같은 실험을 다른 인덱스 이름으로 반복합니다(예: '-r2').
window.expRefresh = async ({ suffix = '' } = {}) => {
  const out = {};
  for (const [name, ri] of [['default', null], ['1s', '1s'], ['30s', '30s'], ['off', '-1']]) {
    const index = 'segments-lab-refresh-' + name + suffix;
    const settings = { number_of_shards: 1, number_of_replicas: 0 };
    if (ri) settings.refresh_interval = ri;
    await es('PUT', '/' + index, { settings, mappings: LAB_MAPPING });
    if (!ri) await sleep(40000);
    const timeline = [];
    const t0 = performance.now();
    const load = await bulkLoad(index, 1000000, 2000, {
      seed: 7,
      onBatch: async (n) => {
        if (n % 50000 === 0) {
          const s = await es('GET', '/_cat/segments/' + index + '?format=json&h=segment,committed');
          timeline.push([n, Math.round((performance.now() - t0) / 1000), s.body.length, s.body.filter((x) => x.committed === 'true').length]);
        }
      },
    });
    await sleep(SETTLE);
    const afterLoad = await idxStats(index);
    await es('POST', '/' + index + '/_refresh');
    await sleep(SETTLE);
    out[name] = { refresh_interval: ri || '(unset)', load, timeline, afterLoad, afterRefresh: await idxStats(index) };
    console.log(name, out[name]);
  }
  return out;
};

// ---------- 실험 B: 같은 문서를 반복 update ----------
// replicas: 1로 주면 replica가 있는 조건에서 같은 실험을 합니다.
window.expUpdate = async ({ suffix = '', replicas = 0 } = {}) => {
  const index = 'segments-lab-update' + suffix;
  await es('PUT', '/' + index, { settings: { number_of_shards: 1, number_of_replicas: replicas, refresh_interval: '1s' }, mappings: LAB_MAPPING_TS });
  if (replicas > 0) await es('GET', '/_cluster/health/' + index + '?wait_for_status=green&timeout=60s');
  const rounds = [];
  for (let round = 0; round <= 5; round++) {
    const res = await bulkLoad(index, 200000, 2000, { seed: 100 + round, ids: true, tsField: 'ts', version: round });
    await sleep(SETTLE);
    const st = await idxStats(index);
    const total = await es('GET', '/' + index + '/_stats/store?filter_path=indices.*.total.store.size_in_bytes');
    rounds.push({ round, ms: res.ms, docs: st.docs, deleted: st.deleted, store: st.store, store_total: Object.values(total.body.indices)[0].total.store.size_in_bytes, segments: st.searchable, merges: st.merges_total, merges_docs: st.merges_docs });
    console.log(rounds[rounds.length - 1]);
  }
  const leases = (await es('GET', '/' + index + '/_stats?level=shards&filter_path=indices.*.shards.*.retention_leases,indices.*.shards.*.seq_no')).body;
  await es('POST', '/' + index + '/_forcemerge?only_expunge_deletes=true');
  await sleep(SETTLE);
  const expungeDefault = await idxStats(index);
  await es('PUT', '/' + index + '/_settings', { index: { merge: { policy: { expunge_deletes_allowed: 0 } } } });
  await es('POST', '/' + index + '/_forcemerge?only_expunge_deletes=true');
  await sleep(SETTLE);
  const expungeAll = await idxStats(index);
  return { rounds, leases, expungeDefault, expungeAll };
};

// ---------- 실험 C: force merge 전후 ----------
// 1) snapshot 증분: force merge 전후로 snapshot을 찍어 새로 올라간 파일 크기를 봅니다.
//    repo는 Elastic Cloud Hosted 기본 repository입니다. 직접 구축 환경이면 바꿔 쓰세요.
window.expForceMergeSnapshot = async (index = 'segments-lab-refresh-1s', repo = 'found-snapshots') => {
  const snap = async (name) => {
    await es('PUT', `/_snapshot/${repo}/${name}?wait_for_completion=true`, { indices: index, include_global_state: false });
    const s = await es('GET', `/_snapshot/${repo}/${name}/_status`);
    const st = s.body.snapshots[0].stats;
    return { incremental_files: st.incremental.file_count, incremental_bytes: st.incremental.size_in_bytes, total_files: st.total.file_count, total_bytes: st.total.size_in_bytes };
  };
  const before = await idxStats(index);
  const s1 = await snap('segments-lab-s1-before');
  const s2 = await snap('segments-lab-s2-nochange');
  const t0 = performance.now();
  await es('POST', `/${index}/_forcemerge?max_num_segments=1`);
  const ms = Math.round(performance.now() - t0);
  await sleep(SETTLE);
  const after = await idxStats(index);
  const s3 = await snap('segments-lab-s3-after-forcemerge');
  await es('DELETE', `/_snapshot/${repo}/segments-lab-s1-before,segments-lab-s2-nochange,segments-lab-s3-after-forcemerge`);
  return { before, s1, s2, ms, after, s3 };
};

// 2) 진행 중 디스크 사용량: store 통계 캐시를 끄고(stats_refresh_interval 0s, reopen 필요)
//    force merge가 끝날 때까지 150ms마다 store.size를 읽습니다.
window.expForceMergePeak = async (index = 'segments-lab-policy-dynamic-ts') => {
  await es('PUT', '/' + index + '/_settings?reopen=true', { index: { store: { stats_refresh_interval: '0s' } } });
  await es('GET', '/_cluster/health/' + index + '?wait_for_status=green&timeout=60s');
  const before = await idxStats(index);
  const fm = await es('POST', `/${index}/_forcemerge?max_num_segments=1&wait_for_completion=false`);
  const t0 = performance.now();
  const samples = [];
  for (;;) {
    const s = await es('GET', `/${index}/_stats/store,merge?filter_path=indices.*.primaries,indices.*.total`);
    const ix = Object.values(s.body.indices)[0];
    // [경과 ms, primary store, primary+replica store, 실행 중 merge 수(primary)]
    samples.push([Math.round(performance.now() - t0), ix.primaries.store.size_in_bytes, ix.total.store.size_in_bytes, ix.primaries.merges.current]);
    const t = await es('GET', `/_tasks/${fm.body.task}`);
    if (t.body.completed === true) break;
    await sleep(150);
  }
  await sleep(5000);
  return { before, ms: Math.round(performance.now() - t0), peak: Math.max(...samples.map((x) => x[1])), peakTotal: Math.max(...samples.map((x) => x[2])), samples, after: await idxStats(index) };
};

// ---------- 실험 D: merge policy 분기 ----------
// 실험 A의 segments-lab-refresh-1s(@timestamp를 처음부터 매핑)와 비교합니다.
window.expPolicy = async ({ suffix = '' } = {}) => {
  const out = {};
  for (const [name, body, gopts] of [
    ['ts-field', { mappings: LAB_MAPPING_TS }, { tsField: 'ts' }],
    ['dynamic-ts', {}, {}], // 매핑 없이 만들고 @timestamp를 dynamic mapping으로 받음
  ]) {
    const index = 'segments-lab-policy-' + name + suffix;
    await es('PUT', '/' + index, Object.assign({ settings: { number_of_shards: 1, number_of_replicas: 0, refresh_interval: '1s' } }, body));
    const timeline = [];
    const t0 = performance.now();
    const load = await bulkLoad(index, 1000000, 2000, Object.assign({
      seed: 7,
      onBatch: async (n) => {
        if (n % 50000 === 0) {
          const s = await es('GET', '/_cat/segments/' + index + '?format=json&h=segment,searchable');
          timeline.push([n, Math.round((performance.now() - t0) / 1000), s.body.filter((x) => x.searchable === 'true').length]);
        }
      },
    }, gopts));
    await sleep(SETTLE);
    out[name] = { load, timeline, after: await idxStats(index) };
    console.log(name, out[name]);
  }
  // dynamic-ts를 close/open 해서 shard engine을 다시 연 뒤 60만 건을 더 넣습니다.
  const index = 'segments-lab-policy-dynamic-ts' + suffix;
  await es('POST', '/' + index + '/_close');
  await es('POST', '/' + index + '/_open?wait_for_active_shards=1');
  await sleep(5000);
  const timeline = [];
  const t0 = performance.now();
  await bulkLoad(index, 600000, 2000, {
    seed: 7, offset: 1000000,
    onBatch: async (n) => {
      if (n % 50000 === 0) {
        const s = await es('GET', '/_cat/segments/' + index + '?format=json&h=segment,searchable');
        timeline.push([1000000 + n, Math.round((performance.now() - t0) / 1000), s.body.filter((x) => x.searchable === 'true').length]);
      }
    },
  });
  await sleep(SETTLE);
  out.reopen = { timeline, after: await idxStats(index) };
  return out;
};

// ---------- 실험 E: segment 수와 kNN 검색 지연 ----------
// 384차원 vector 3만 건을 refresh_interval 1s로 넣고, segment가 여러 개인 상태와
// force merge로 1개가 된 상태에서 같은 query vector 200개의 took을 비교합니다.
window.randomUnitVector = (r, dims) => {
  const v = Array.from({ length: dims }, () => r() * 2 - 1);
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return v.map((x) => Math.round((x / n) * 1e6) / 1e6);
};
window.knnLatency = async (index, queries, k = 10, numCandidates = 100) => {
  const took = [];
  for (const q of queries) {
    const r = await es('POST', '/' + index + '/_search', { knn: { field: 'vec', query_vector: q, k, num_candidates: numCandidates }, _source: false, size: k });
    took.push(r.body.took);
  }
  const s = [...took].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor((s.length * p) / 100))];
  return { n: s.length, p50: pct(50), p90: pct(90), p99: pct(99), mean: Math.round((s.reduce((a, x) => a + x, 0) / s.length) * 10) / 10 };
};
window.expKnn = async ({ suffix = '', docs = 30000, dims = 384, batch = 250 } = {}) => {
  const index = 'segments-lab-knn' + suffix;
  await es('PUT', '/' + index, {
    settings: { number_of_shards: 1, number_of_replicas: 0, refresh_interval: '1s' },
    mappings: { properties: { vec: { type: 'dense_vector', dims, similarity: 'cosine' }, n: { type: 'integer' } } },
  });
  const mapping = (await es('GET', '/' + index + '/_mapping')).body;
  const r = mkRng(2026);
  const t0 = performance.now();
  for (let s = 0; s < docs; s += batch) {
    const nd = Array.from({ length: Math.min(batch, docs - s) }, (_, k) => JSON.stringify({ index: {} }) + '\n' + JSON.stringify({ n: s + k, vec: randomUnitVector(r, dims) })).join('\n') + '\n';
    await es('POST', '/' + index + '/_bulk', nd, true);
  }
  const loadMs = Math.round(performance.now() - t0);
  await sleep(SETTLE);
  const qr = mkRng(7);
  const queries = Array.from({ length: 200 }, () => randomUnitVector(qr, dims));
  const warm = Array.from({ length: 20 }, () => randomUnitVector(qr, dims));
  const before = await idxStats(index);
  await knnLatency(index, warm);
  const latBefore = await knnLatency(index, queries);
  const fm = await es('POST', '/' + index + '/_forcemerge?max_num_segments=1&wait_for_completion=false');
  const f0 = performance.now();
  while ((await es('GET', '/_tasks/' + fm.body.task)).body.completed !== true) await sleep(1000);
  const forceMergeMs = Math.round(performance.now() - f0);
  await sleep(SETTLE);
  const after = await idxStats(index);
  await knnLatency(index, warm);
  const latAfter = await knnLatency(index, queries);
  return { mapping, loadMs, before, latBefore, forceMergeMs, after, latAfter };
};

// segment 수를 일부러 늘린 조건. 기본 merge policy로는 3만 건을 넣는 동안 segment가 2개로 합쳐져서
// segments_per_tier를 64로 올리고 750건마다 refresh해 segment 40개를 만든 뒤 1개와 비교합니다.
window.expKnnSegments = async ({ suffix = '-seg40', docs = 30000, dims = 384, batch = 250, refreshEvery = 3 } = {}) => {
  const index = 'segments-lab-knn' + suffix;
  const c = await es('PUT', '/' + index, { settings: { number_of_shards: 1, number_of_replicas: 0, refresh_interval: '-1', 'merge.policy.segments_per_tier': 64 }, mappings: { properties: { vec: { type: 'dense_vector', dims, similarity: 'cosine' }, n: { type: 'integer' } } } });
  if (c.status !== 200) return { error: c.body };
  const r = mkRng(2026);
  const t0 = performance.now();
  let b = 0;
  for (let s = 0; s < docs; s += batch) {
    const nd = Array.from({ length: Math.min(batch, docs - s) }, (_, k) => JSON.stringify({ index: {} }) + '\n' + JSON.stringify({ n: s + k, vec: randomUnitVector(r, dims) })).join('\n') + '\n';
    await es('POST', '/' + index + '/_bulk', nd, true);
    if (++b % refreshEvery === 0) await es('POST', '/' + index + '/_refresh');
  }
  await es('POST', '/' + index + '/_refresh');
  const loadMs = Math.round(performance.now() - t0);
  await sleep(SETTLE);
  const qr = mkRng(7);
  const queries = Array.from({ length: 200 }, () => randomUnitVector(qr, dims));
  const warm = Array.from({ length: 20 }, () => randomUnitVector(qr, dims));
  const before = await idxStats(index);
  await knnLatency(index, warm);
  const latBefore = await knnLatency(index, queries);
  const fm = await es('POST', '/' + index + '/_forcemerge?max_num_segments=1&wait_for_completion=false');
  const f0 = performance.now();
  while ((await es('GET', '/_tasks/' + fm.body.task)).body.completed !== true) await sleep(1000);
  const forceMergeMs = Math.round(performance.now() - f0);
  await sleep(SETTLE);
  const after = await idxStats(index);
  await knnLatency(index, warm);
  const latAfter = await knnLatency(index, queries);
  const latAfter2 = await knnLatency(index, queries); // 같은 query를 한 번 더
  return { loadMs, before, latBefore, forceMergeMs, after, latAfter, latAfter2 };
};

// ---------- 정리 ----------
window.cleanup = () => es('DELETE', '/segments-lab-*');

console.log('loaded: expRefresh(), expUpdate(), expPolicy(), expForceMergeSnapshot(), expForceMergePeak(), expKnn(), expKnnSegments(), cleanup()');
