"""03. 저장 용량 비교 실측 스크립트.

같은 synthetic 로그를 다섯 가지 index 설정에 같은 순서로 적재하고
store.size, _disk_usage, 적재 속도, 조회 지연, _source 차이를 잰다.

  python3 run.py --es http://localhost:9200 --run 1
  python3 run.py --es http://localhost:9200 --run 2 --datasets base

전제: Elasticsearch 9.5.x, trial 또는 Enterprise 라이선스(synthetic _source 조합).
"""
import argparse
import json
import os
import statistics
import sys
import time

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_datagen"))
import loggen  # noqa: E402

CONFIGS = {
    "std": {"index.mode": "standard"},
    "std-bc": {"index.mode": "standard", "index.codec": "best_compression"},
    "std-syn": {"index.mode": "standard", "index.mapping.source.mode": "synthetic"},
    "logsdb": {"index.mode": "logsdb"},
    "columnar": {"index.mode": "logsdb_columnar"},
}
DATASETS = {
    "base": dict(n=300_000, hosts=50),
    "hicard": dict(n=300_000, hosts=50_000),
    "fields200": dict(n=100_000, hosts=50, extra_fields=180),
    "longmsg": dict(n=100_000, hosts=50, msg="long"),
}
BULK = 5000
S = requests.Session()
H = {"Content-Type": "application/json"}


def es(method, path, body=None, raw=None, ok=(200, 201)):
    data = raw if raw is not None else (json.dumps(body) if body is not None else None)
    ct = {"Content-Type": "application/x-ndjson"} if raw is not None else H
    r = S.request(method, ES + path, data=data, headers=ct, timeout=3600)
    if r.status_code not in ok:
        raise RuntimeError(f"{method} {path} -> {r.status_code} {r.text[:500]}")
    return r.json() if r.text else None


def node_cpu_ms():
    st = es("GET", "/_nodes/_local/stats/process")
    return next(iter(st["nodes"].values()))["process"]["cpu"]["total_in_millis"]


def ndjson_file(name, spec):
    path = os.path.join(WORK, f"{name}.ndjson")
    if not os.path.exists(path):
        with open(path, "w") as f:
            for d in loggen.gen(**spec):
                f.write('{"create":{}}\n' + json.dumps(d, separators=(",", ":")) + "\n")
    return path


def store_bytes(index):
    time.sleep(12)  # index.store.stats_refresh_interval 기본 10초
    st = es("GET", f"/{index}/_stats/store,docs,segments")
    p = st["_all"]["primaries"]
    return p["store"]["size_in_bytes"], p["docs"]["count"], p["segments"]["count"]


def disk_usage(index):
    du = es("POST", f"/{index}/_disk_usage?run_expensive_tasks=true")
    d = next(v for k, v in du.items() if k != "_shards")
    tot = {"inverted_index": 0, "stored_fields": 0, "doc_values": 0, "points": 0, "norms": 0}
    per_field = {}
    for fname, f in d["fields"].items():
        for k in tot:
            key = k + "_in_bytes" if k != "inverted_index" else None
            v = f["inverted_index"]["total_in_bytes"] if k == "inverted_index" else f.get(key, 0)
            tot[k] += v
        per_field[fname] = f["total_in_bytes"]
    top = sorted(per_field.items(), key=lambda x: -x[1])[:8]
    return {"store_size_in_bytes": d["store_size_in_bytes"], "by_structure": tot, "top_fields": top}


def timed(index, body, reps=15):
    for _ in range(3):
        es("POST", f"/{index}/_search?request_cache=false", body)
    ts = []
    for _ in range(reps):
        t = time.perf_counter()
        es("POST", f"/{index}/_search?request_cache=false", body)
        ts.append((time.perf_counter() - t) * 1000)
    return round(statistics.median(ts), 1)


def queries(index):
    q = {
        "term_count": {"size": 0, "track_total_hits": True, "query": {"term": {"service.name": "payment"}}},
        "range_terms_agg": {"size": 0, "query": {"range": {"@timestamp": {"gte": "2026-11-01T00:30:00Z"}}},
                            "aggs": {"h": {"terms": {"field": "host.name", "size": 10}}}},
        "fetch_100_source": {"size": 100, "query": {"term": {"log.level": "ERROR"}}},
        "match_message": {"size": 0, "track_total_hits": True, "query": {"match": {"message": "timeout"}}},
    }
    return {k: timed(index, v) for k, v in q.items()}


def put_template(cfg, ds_name, spec):
    m = loggen.mapping(spec.get("extra_fields", 0), spec.get("obj_array", False))
    settings = {"index.number_of_shards": 1, "index.number_of_replicas": 0, "index.refresh_interval": "30s"}
    settings.update(CONFIGS[cfg])
    es("PUT", f"/_index_template/sf-{cfg}-{ds_name}", {
        "index_patterns": [f"sf-{cfg}-{ds_name}*"], "data_stream": {}, "priority": 500,
        "template": {"settings": settings, "mappings": m}})


def run_one(cfg, ds_name, spec, run):
    name = f"sf-{cfg}-{ds_name}-r{run}"
    S.delete(ES + f"/_data_stream/{name}")
    put_template(cfg, ds_name, spec)
    es("PUT", f"/_data_stream/{name}")
    backing = es("GET", f"/_data_stream/{name}")["data_streams"][0]["indices"][0]["index_name"]
    eff = es("GET", f"/{backing}/_settings?include_defaults=true&flat_settings=true")[backing]
    eff = {**eff["defaults"], **eff["settings"]}
    keys = ["index.mode", "index.codec", "index.mapping.source.mode", "index.sort.field", "index.sort.order"]
    effective = {k: eff.get(k) for k in keys}
    path = ndjson_file(ds_name, spec)
    cpu0, t0, sent = node_cpu_ms(), time.perf_counter(), 0
    with open(path) as f:
        buf = []
        for line in f:
            buf.append(line)
            if len(buf) == BULK * 2:
                r = es("POST", f"/{name}/_bulk", raw="".join(buf))
                assert not r["errors"], json.dumps(r)[:800]
                sent += BULK
                buf = []
        if buf:
            r = es("POST", f"/{name}/_bulk", raw="".join(buf))
            assert not r["errors"], json.dumps(r)[:800]
            sent += len(buf) // 2
    es("POST", f"/{name}/_refresh")
    secs = time.perf_counter() - t0
    cpu = node_cpu_ms() - cpu0
    es("POST", f"/{name}/_flush")
    size_before, docs, segs = store_bytes(backing)
    es("POST", f"/{backing}/_forcemerge?max_num_segments=1")
    es("POST", f"/{name}/_flush")
    size_after, _, segs_after = store_bytes(backing)
    res = {
        "run": run, "config": cfg, "dataset": ds_name, "docs": docs, "effective": effective,
        "index_secs": round(secs, 1), "docs_per_sec": round(docs / secs), "es_cpu_ms_per_1k_docs": round(cpu / docs * 1000, 1),
        "store_before_fm": size_before, "segments_before_fm": segs,
        "store_after_fm": size_after, "bytes_per_doc_after_fm": round(size_after / docs, 1),
        "disk_usage": disk_usage(backing), "query_ms": queries(name),
    }
    print(json.dumps({k: v for k, v in res.items() if k != "disk_usage"}), flush=True)
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--es", default="http://localhost:9200")
    ap.add_argument("--run", type=int, default=1)
    ap.add_argument("--datasets", default=",".join(DATASETS))
    ap.add_argument("--configs", default=",".join(CONFIGS))
    ap.add_argument("--work", default="/tmp/sf-work")
    ap.add_argument("--keep", action="store_true", help="측정 뒤 data stream을 지우지 않는다")
    a = ap.parse_args()
    ES, WORK = a.es.rstrip("/"), a.work
    os.makedirs(WORK, exist_ok=True)
    out = os.path.join(os.path.dirname(__file__), "results", f"raw_run{a.run}.jsonl")
    for ds in a.datasets.split(","):
        for cfg in a.configs.split(","):
            r = run_one(cfg, ds, DATASETS[ds], a.run)
            with open(out, "a") as f:
                f.write(json.dumps(r) + "\n")
            if not a.keep:
                S.delete(ES + f"/_data_stream/sf-{cfg}-{ds}-r{a.run}")
