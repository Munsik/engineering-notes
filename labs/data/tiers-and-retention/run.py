"""05. 오래된 데이터 실측 스크립트(단일 노드 축소판).

전제
  - Elasticsearch 9.5.x 단일 노드, trial 또는 Enterprise 라이선스(searchable snapshot)
  - elasticsearch.yml: path.repo, xpack.searchable.snapshot.shared_cache.size(예: 1gb)
  - snapshot repository는 로컬 fs. S3 같은 object storage보다 지연이 훨씬 작다는 점을 감안해서 읽는다.

  python3 run.py setup        # repository 등록, 데이터 적재, snapshot, full/partial mount
  python3 run.py latency 1    # regular / fully mounted / partially mounted 조회 지연(첫 실행과 반복)
  (노드 재시작 후) python3 run.py latency 2
  python3 run.py tier         # _tier로 frozen 제외
  python3 run.py ilm          # ILM을 초 단위로 줄여 hot -> frozen 전환 관찰
  python3 run.py restore      # partially mounted 데이터를 regular index로 복원
"""
import json
import os
import statistics
import sys
import time

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_datagen"))
import loggen  # noqa: E402

ES = os.environ.get("ES", "http://localhost:9200")
S = requests.Session()
OUT = os.path.join(os.path.dirname(__file__), "results")
REPO = "lab-repo"


def es(method, path, body=None, raw=None, ok=(200, 201)):
    data = raw if raw is not None else (json.dumps(body) if body is not None else None)
    ct = "application/x-ndjson" if raw is not None else "application/json"
    r = S.request(method, ES + path, data=data, headers={"Content-Type": ct}, timeout=3600)
    if r.status_code not in ok:
        raise RuntimeError(f"{method} {path} -> {r.status_code} {r.text[:600]}")
    return r.json() if r.text else None


def save(name, obj):
    with open(os.path.join(OUT, name), "a") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def ingest(target, n, seed, offset=0):
    lines = []
    for d in loggen.gen(n, seed=seed, offset=offset):
        lines.append('{"create":{}}\n' + json.dumps(d, separators=(",", ":")) + "\n")
        if len(lines) == 5000:
            r = es("POST", f"/{target}/_bulk", raw="".join(lines)); assert not r["errors"]; lines = []
    if lines:
        r = es("POST", f"/{target}/_bulk", raw="".join(lines)); assert not r["errors"]


def setup():
    es("PUT", f"/_snapshot/{REPO}", {"type": "fs", "settings": {"location": "lab"}})
    es("PUT", "/_index_template/tier-lab", {"index_patterns": ["tier-lab*"], "data_stream": {}, "priority": 500,
        "template": {"settings": {"number_of_shards": 1, "number_of_replicas": 0, "index.mode": "logsdb"}, "mappings": loggen.mapping()}})
    S.delete(ES + "/_data_stream/tier-lab")
    ingest("tier-lab", 1_000_000, seed=500)
    es("POST", "/tier-lab/_rollover")
    src = es("GET", "/_data_stream/tier-lab")["data_streams"][0]["indices"][0]["index_name"]
    es("POST", f"/{src}/_forcemerge?max_num_segments=1")
    es("PUT", f"/{src}/_settings", {"index.blocks.write": True})
    t = time.perf_counter()
    es("PUT", f"/_snapshot/{REPO}/snap-1?wait_for_completion=true", {"indices": src, "include_global_state": False})
    snap_s = time.perf_counter() - t
    res = {"source_index": src, "snapshot_secs": round(snap_s, 1)}
    for name, storage in [("full-lab", "full_copy"), ("partial-lab", "shared_cache")]:
        S.delete(ES + f"/{name}")
        t = time.perf_counter()
        es("POST", f"/_snapshot/{REPO}/snap-1/_mount?wait_for_completion=true&storage={storage}",
           {"index": src, "renamed_index": name, "index_settings": {"index.number_of_replicas": 0}})
        es("GET", f"/_cluster/health/{name}?wait_for_status=green&timeout=300s")
        res[f"mount_{name}_secs"] = round(time.perf_counter() - t, 1)
    time.sleep(12)
    cat = S.get(ES + f"/_cat/indices/{src},full-lab,partial-lab?v&h=index,docs.count,store.size,pri.store.size&bytes=mb&expand_wildcards=all").text
    res["cat_indices"] = cat
    res["tier_pref"] = {i: es("GET", f"/{i}/_settings/index.routing.allocation.include._tier_preference?flat_settings=true")[i]["settings"]
                        for i in [src, "full-lab", "partial-lab"]}
    save("setup.jsonl", res)


QUERIES = {
    "range_terms_agg": {"size": 0, "query": {"range": {"@timestamp": {"gte": "2026-11-01T02:00:00Z"}}},
                        "aggs": {"h": {"terms": {"field": "host.name", "size": 10}}}},
    "term_count": {"size": 0, "track_total_hits": True, "query": {"term": {"service.name": "payment"}}},
    "fetch_100": {"size": 100, "query": {"term": {"log.level": "ERROR"}}, "sort": [{"@timestamp": "desc"}]},
}


def took(index, q):
    t = time.perf_counter()
    r = es("POST", f"/{index}/_search?request_cache=false", q)
    return (time.perf_counter() - t) * 1000, r["took"]


def latency(run):
    src = es("GET", "/_data_stream/tier-lab")["data_streams"][0]["indices"][0]["index_name"]
    cache0 = es("GET", "/_searchable_snapshots/cache/stats")
    for label, idx in [("regular", src), ("fully_mounted", "full-lab"), ("partially_mounted", "partial-lab")]:
        for qn, q in QUERIES.items():
            first = took(idx, q)[0]
            reps = [took(idx, q)[0] for _ in range(10)]
            save("latency.jsonl", {"run": run, "index": label, "query": qn, "first_ms": round(first, 1),
                                   "repeat_p50_ms": round(statistics.median(reps), 1)})
    cache1 = es("GET", "/_searchable_snapshots/cache/stats")
    save("cache_stats.jsonl", {"run": run, "before": cache0, "after": cache1})


def tier():
    src = es("GET", "/_data_stream/tier-lab")["data_streams"][0]["indices"][0]["index_name"]
    pattern = f"{src},full-lab,partial-lab"
    q_all = {"size": 0, "aggs": {"by_index": {"terms": {"field": "_index"}}}}
    q_ex = {"size": 0, "query": {"bool": {"must_not": {"terms": {"_tier": ["data_frozen"]}}}}, "aggs": {"by_index": {"terms": {"field": "_index"}}}}
    a = es("POST", f"/{pattern}/_search", q_all)
    b = es("POST", f"/{pattern}/_search", q_ex)
    esql = es("POST", "/_query", {"query": f"FROM {pattern} METADATA _index | STATS c = COUNT(*) BY _index",
                                  "filter": {"bool": {"must_not": {"terms": {"_tier": ["data_frozen"]}}}}}, ok=(200, 400))
    save("tier.jsonl", {
        "without_filter": {"shards": a["_shards"], "buckets": a["aggregations"]["by_index"]["buckets"]},
        "must_not_tier_frozen": {"shards": b["_shards"], "buckets": b["aggregations"]["by_index"]["buckets"]},
        "esql_with_filter": esql})


def ilm():
    es("PUT", "/_cluster/settings", {"persistent": {"indices.lifecycle.poll_interval": "5s"}})
    es("PUT", "/_ilm/policy/lab-frozen", {"policy": {"phases": {
        "hot": {"actions": {"rollover": {"max_docs": 100000}}},
        "frozen": {"min_age": "20s", "actions": {"searchable_snapshot": {"snapshot_repository": REPO}}}}}})
    es("PUT", "/_index_template/ilm-lab", {"index_patterns": ["ilm-lab*"], "data_stream": {}, "priority": 500,
        "template": {"settings": {"number_of_shards": 1, "number_of_replicas": 0, "index.lifecycle.name": "lab-frozen"},
                     "mappings": loggen.mapping()}})
    S.delete(ES + "/_data_stream/ilm-lab")
    t0 = time.time()
    ingest("ilm-lab", 120_000, seed=600)
    seen, steps = set(), []
    while time.time() - t0 < 600:
        ex = es("GET", "/ilm-lab/_ilm/explain?expand_wildcards=all")
        for idx, v in ex["indices"].items():
            key = (idx, v.get("phase"), v.get("action"), v.get("step"))
            if key not in seen:
                seen.add(key); steps.append({"t": round(time.time() - t0, 1), "index": idx, "phase": v.get("phase"),
                                             "action": v.get("action"), "step": v.get("step")})
        backing = [i["index_name"] for i in es("GET", "/_data_stream/ilm-lab")["data_streams"][0]["indices"]]
        if any(b.startswith("partial-") for b in backing) and all(
                ex["indices"].get(b, {}).get("step") == "complete" for b in backing if b.startswith("partial-")):
            break
        time.sleep(2)
    snaps = es("GET", f"/_snapshot/{REPO}/_all")["snapshots"]
    save("ilm.jsonl", {"steps": steps, "backing": backing, "snapshots": [s["snapshot"] for s in snaps],
                       "mounted_settings": es("GET", f"/{[b for b in backing if b.startswith('partial-')][0]}/_settings?filter_path=**.store.snapshot&expand_wildcards=all")})


def restore():
    st = es("GET", "/partial-lab/_settings?filter_path=**.index.store.snapshot&flat_settings=false")["partial-lab"]["settings"]["index"]["store"]["snapshot"]
    S.delete(ES + "/rehydrated-lab")
    t = time.perf_counter()
    es("POST", f"/_snapshot/{st['repository_name']}/{st['snapshot_name']}/_restore?wait_for_completion=true", {
        "indices": st["index_name"], "rename_pattern": "(.+)", "rename_replacement": "rehydrated-lab",
        "include_aliases": False, "index_settings": {"index.number_of_replicas": 0,
                                                     "index.routing.allocation.include._tier_preference": "data_hot"},
        "ignore_index_settings": ["index.lifecycle.name"]})
    secs = time.perf_counter() - t
    time.sleep(12)
    cat = S.get(ES + "/_cat/indices/rehydrated-lab,partial-lab?v&h=index,health,docs.count,store.size&bytes=mb").text
    save("restore.jsonl", {"snapshot_source": st, "restore_secs": round(secs, 1), "cat_indices": cat})


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "latency":
        latency(int(sys.argv[2]))
    else:
        {"setup": setup, "tier": tier, "ilm": ilm, "restore": restore}[cmd]()
