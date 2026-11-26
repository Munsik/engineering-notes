"""04. Shard와 bulk 실측 스크립트(단일 노드 축소판).

  python3 run.py --exp A --run 1   # bulk 크기 x primary shard 수
  python3 run.py --exp B --run 1   # tenant별 data stream 300개 대 공용 data stream 1개
  python3 run.py --exp C           # routing 편중으로 shard 크기 불균형 재현과 진단

전제: Elasticsearch 9.5.x 단일 노드. 클라이언트 하나가 순서대로 _bulk를 보낸다.
"""
import argparse
import json
import os
import random
import statistics
import sys
import time

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_datagen"))
import loggen  # noqa: E402

S = requests.Session()
OUT = os.path.join(os.path.dirname(__file__), "results")


def es(method, path, body=None, raw=None, ok=(200, 201)):
    data = raw if raw is not None else (json.dumps(body) if body is not None else None)
    ct = "application/x-ndjson" if raw is not None else "application/json"
    r = S.request(method, ES + path, data=data, headers={"Content-Type": ct}, timeout=3600)
    if r.status_code not in ok:
        raise RuntimeError(f"{method} {path} -> {r.status_code} {r.text[:400]}")
    return r.json() if r.text else None


def node_stats():
    st = es("GET", "/_nodes/_local/stats/process,indices,thread_pool")
    n = next(iter(st["nodes"].values()))
    return {"cpu_ms": n["process"]["cpu"]["total_in_millis"],
            "shard_bulk_ops": n["indices"]["bulk"]["total_operations"],
            "write_rejected": n["thread_pool"]["write"]["rejected"],
            "index_time_ms": n["indices"]["indexing"]["index_time_in_millis"]}


def docs_lines(n, **kw):
    for d in loggen.gen(n, **kw):
        yield json.dumps(d, separators=(",", ":"))


def exp_a(run, shards_list=(1, 5, 20)):
    bulk_list = [1, 10, 100, 1000, 5000]
    total = {1: 5_000, 10: 30_000}
    docs = list(docs_lines(100_000, seed=100 + run))
    for shards in shards_list:
        for bulk in bulk_list:
            idx = f"sb-a-p{shards}-b{bulk}-r{run}"
            S.delete(ES + f"/{idx}")
            es("PUT", f"/{idx}", {"settings": {"number_of_shards": shards, "number_of_replicas": 0, "refresh_interval": "30s"},
                                 "mappings": loggen.mapping()})
            n = total.get(bulk, 100_000)
            s0 = node_stats(); t0 = time.perf_counter(); lat = []
            for i in range(0, n, bulk):
                body = "".join('{"create":{}}\n' + d + "\n" for d in docs[i:i + bulk])
                t = time.perf_counter()
                r = es("POST", f"/{idx}/_bulk", raw=body)
                lat.append((time.perf_counter() - t) * 1000)
                assert not r["errors"]
            secs = time.perf_counter() - t0; s1 = node_stats()
            reqs = len(lat)
            res = {"run": run, "primary_shards": shards, "bulk_docs": bulk, "bulk_kb": round(len(body) / 1024, 1), "docs": n,
                   "docs_per_sec": round(n / secs), "es_cpu_ms_per_1k_docs": round((s1["cpu_ms"] - s0["cpu_ms"]) / n * 1000, 1),
                   "client_requests": reqs, "shard_bulk_ops": s1["shard_bulk_ops"] - s0["shard_bulk_ops"],
                   "shard_ops_per_request": round((s1["shard_bulk_ops"] - s0["shard_bulk_ops"]) / reqs, 2),
                   "p50_ms": round(statistics.median(lat), 1), "p99_ms": round(sorted(lat)[int(len(lat) * 0.99) - 1], 1),
                   "write_rejected": s1["write_rejected"] - s0["write_rejected"]}
            print(json.dumps(res), flush=True)
            with open(os.path.join(OUT, "A_bulk_shards.jsonl"), "a") as f:
                f.write(json.dumps(res) + "\n")
            S.delete(ES + f"/{idx}")


def cluster_footprint():
    cs = S.get(ES + "/_cluster/state/metadata,routing_table").content
    st = es("GET", "/_cluster/stats?filter_path=indices.shards.total,indices.mappings.total_deduplicated_mapping_size_in_bytes,indices.segments.count,indices.count")
    hp = es("GET", "/_nodes/_local/stats/jvm,indices?filter_path=nodes.*.jvm.mem.heap_used_in_bytes,nodes.*.indices.mappings")
    n = next(iter(hp["nodes"].values()))
    return {"indices": st["indices"]["count"], "shards": st["indices"]["shards"]["total"], "segments": st["indices"]["segments"]["count"],
            "cluster_state_json_bytes": len(cs),
            "dedup_mapping_bytes": st["indices"]["mappings"]["total_deduplicated_mapping_size_in_bytes"],
            "field_mapper_overhead_bytes": n["indices"]["mappings"].get("total_estimated_overhead_in_bytes")}


def exp_b(run):
    TEN, DSETS, N = 100, ["app", "access", "audit"], 300_000
    tmpl = {"index_patterns": ["mt-*"], "data_stream": {}, "priority": 500,
            "template": {"settings": {"number_of_shards": 1, "number_of_replicas": 0, "index.mode": "logsdb", "refresh_interval": "30s"},
                         "mappings": loggen.mapping(tenants=TEN)}}
    es("PUT", "/_index_template/mt", tmpl)
    rnd = random.Random(7)
    docs = [(d, rnd.choice(DSETS)) for d in loggen.gen(N, tenants=TEN, seed=200 + run)]
    for layout in ["per-tenant", "shared"]:
        S.delete(ES + "/_data_stream/mt-*")
        time.sleep(2)
        base = cluster_footprint()
        s0 = node_stats(); t0 = time.perf_counter()
        for i in range(0, N, 5000):
            lines = []
            for d, ds in docs[i:i + 5000]:
                target = f"mt-{d['tenant']['id']}-{ds}" if layout == "per-tenant" else f"mt-shared-{ds}"
                if layout == "shared":
                    pass
                lines.append(json.dumps({"create": {"_index": target}}) + "\n" + json.dumps(d, separators=(",", ":")) + "\n")
            r = es("POST", "/_bulk", raw="".join(lines))
            assert not r["errors"], json.dumps(r)[:500]
        es("POST", "/mt-*/_refresh")
        secs = time.perf_counter() - t0; s1 = node_stats()
        time.sleep(3)
        fp = cluster_footprint()
        # 한 tenant의 최근 데이터 조회
        if layout == "per-tenant":
            q_idx, q = "mt-tenant-042-*", {"size": 0, "aggs": {"lvl": {"terms": {"field": "log.level"}}}}
        else:
            q_idx, q = "mt-shared-*", {"size": 0, "query": {"term": {"tenant.id": "tenant-042"}}, "aggs": {"lvl": {"terms": {"field": "log.level"}}}}
        for _ in range(3):
            es("POST", f"/{q_idx}/_search?request_cache=false", q)
        ts = []
        for _ in range(20):
            t = time.perf_counter(); es("POST", f"/{q_idx}/_search?request_cache=false", q); ts.append((time.perf_counter() - t) * 1000)
        q_all = {"size": 0, "query": {"range": {"@timestamp": {"gte": "2026-11-01T00:30:00Z"}}}, "aggs": {"t": {"terms": {"field": "tenant.id", "size": 5}}}}
        for _ in range(2):
            es("POST", "/mt-*/_search?request_cache=false", q_all)
        ta = []
        for _ in range(10):
            t = time.perf_counter(); es("POST", "/mt-*/_search?request_cache=false", q_all); ta.append((time.perf_counter() - t) * 1000)
        size = es("GET", "/mt-*/_stats/store")["_all"]["primaries"]["store"]["size_in_bytes"]
        res = {"run": run, "layout": layout, "docs": N, "docs_per_sec": round(N / secs),
               "es_cpu_ms_per_1k_docs": round((s1["cpu_ms"] - s0["cpu_ms"]) / N * 1000, 1),
               "shard_ops_per_request": round((s1["shard_bulk_ops"] - s0["shard_bulk_ops"]) / (N / 5000), 1),
               "store_bytes": size, "delta": {k: fp[k] - base[k] for k in fp if isinstance(fp[k], int) and isinstance(base[k], int)},
               "one_tenant_query_p50_ms": round(statistics.median(ts), 1), "all_tenants_agg_p50_ms": round(statistics.median(ta), 1)}
        print(json.dumps(res), flush=True)
        with open(os.path.join(OUT, "B_multitenant.jsonl"), "a") as f:
            f.write(json.dumps(res) + "\n")
    S.delete(ES + "/_data_stream/mt-*")


def exp_c():
    idx = "sb-c-skew"
    S.delete(ES + f"/{idx}")
    es("PUT", f"/{idx}", {"settings": {"number_of_shards": 4, "number_of_replicas": 0}, "mappings": loggen.mapping(tenants=20)})
    rnd = random.Random(3)
    N = 200_000
    lines = []
    for i, d in enumerate(loggen.gen(N, tenants=20, seed=300)):
        tenant = "tenant-000" if rnd.random() < 0.7 else d["tenant"]["id"]
        d["tenant"]["id"] = tenant
        lines.append(json.dumps({"create": {"routing": tenant}}) + "\n" + json.dumps(d, separators=(",", ":")) + "\n")
        if len(lines) == 5000:
            es("POST", f"/{idx}/_bulk", raw="".join(lines)); lines = []
    if lines:
        es("POST", f"/{idx}/_bulk", raw="".join(lines))
    es("POST", f"/{idx}/_refresh")
    time.sleep(12)
    cat = S.get(ES + f"/_cat/shards/{idx}?v&h=index,shard,prirep,docs,store&s=shard&bytes=mb").text
    st = es("GET", f"/{idx}/_stats/indexing,store?level=shards")
    rows = []
    for sid, copies in st["indices"][idx]["shards"].items():
        c = copies[0]
        rows.append({"shard": int(sid), "index_total": c["indexing"]["index_total"], "index_time_ms": c["indexing"]["index_time_in_millis"],
                     "store_bytes": c["store"]["size_in_bytes"]})
    res = {"cat_shards": cat, "shards": sorted(rows, key=lambda r: r["shard"])}
    print(json.dumps(res, indent=1))
    with open(os.path.join(OUT, "C_skew.json"), "w") as f:
        json.dump(res, f, indent=1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--es", default="http://localhost:9200")
    ap.add_argument("--exp", required=True)
    ap.add_argument("--run", type=int, default=1)
    ap.add_argument("--shards", default="1,5,20", help="실험 A의 primary shard 수 목록")
    a = ap.parse_args()
    ES = a.es.rstrip("/")
    {"A": lambda: exp_a(a.run, [int(x) for x in a.shards.split(",")]), "B": lambda: exp_b(a.run), "C": exp_c}[a.exp]()
