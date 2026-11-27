"""06. Mapping과 필드 수 실측 스크립트(단일 노드).

  python3 run.py --exp A   # 필드 수에 따른 mapping 크기, heap 추정치, 첫 문서 적재 시간
  python3 run.py --exp B   # 필드 한도를 넘는 문서: standard, logsdb, failure store
  python3 run.py --exp C   # 임의 키(UUID가 든 필드 이름): object 대 flattened
  python3 run.py --exp D   # ECS식 점 표기 필드: 기본 대 subobjects: false 의 mapper 수

전제: Elasticsearch 9.5.x 단일 노드, 보안 끔. ES 환경변수로 주소를 바꿀 수 있다(기본 http://localhost:9200).
"""
import argparse, json, os, time, uuid, random
import requests

ES = os.environ.get("ES", "http://localhost:9200")
S = requests.Session()
OUT = os.path.join(os.path.dirname(__file__), "results")


def es(method, path, body=None, raw=None, ok=(200, 201)):
    data = raw if raw is not None else (json.dumps(body) if body is not None else None)
    ct = "application/x-ndjson" if raw is not None else "application/json"
    r = S.request(method, ES + path, data=data, headers={"Content-Type": ct}, timeout=3600)
    if ok and r.status_code not in ok:
        raise RuntimeError(f"{method} {path} -> {r.status_code} {r.text[:400]}")
    return r.status_code, (r.json() if r.text else None)


def save(name, obj):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
    print(json.dumps(obj, indent=2, ensure_ascii=False))


def node_mapping_overhead():
    _, st = es("GET", "/_nodes/_local/stats/indices?filter_path=nodes.*.indices.mappings")
    return next(iter(st["nodes"].values()))["indices"]["mappings"]


def cluster_mapping():
    _, st = es("GET", "/_cluster/stats?filter_path=indices.mappings.total_field_count,indices.mappings.total_deduplicated_field_count,indices.mappings.total_deduplicated_mapping_size_in_bytes")
    return st["indices"]["mappings"]


def drop(pattern):
    es("DELETE", f"/{pattern}?ignore_unavailable=true&allow_no_indices=true", ok=None)
    es("DELETE", f"/_data_stream/{pattern}", ok=None)


def exp_a():
    res = []
    for n in (100, 1000, 5000, 20000, 50000):
        idx = f"lab-fields-{n}"
        drop(idx)
        es("PUT", f"/{idx}", {"settings": {"number_of_replicas": 0, "index.mapping.total_fields.limit": n + 100}})
        base = node_mapping_overhead()
        doc = {"@timestamp": "2026-11-27T00:00:00Z"}
        doc.update({f"f{i:05d}": i for i in range(n)})
        t0 = time.time()
        es("POST", f"/{idx}/_doc?refresh=true", doc)
        first_ms = round((time.time() - t0) * 1000)
        t0 = time.time()
        es("POST", f"/{idx}/_doc?refresh=true", doc)
        second_ms = round((time.time() - t0) * 1000)
        after = node_mapping_overhead()
        _, m = es("GET", f"/{idx}/_mapping")
        res.append({
            "fields": n,
            "mapping_json_bytes": len(json.dumps(m)),
            "estimated_overhead_delta_bytes": after["total_estimated_overhead_in_bytes"] - base["total_estimated_overhead_in_bytes"],
            "first_doc_ms(dynamic mapping update)": first_ms,
            "second_doc_ms(same fields)": second_ms,
        })
        drop(idx)
    save("exp_a_field_count.json", res)


def exp_b():
    out = {}
    doc = {"@timestamp": "2026-11-27T00:00:00Z", "message": "too many fields"}
    doc.update({f"attr.k{i:04d}": "v" for i in range(1200)})
    # 1) standard index, default limit 1000
    drop("lab-limit-standard")
    es("PUT", "/lab-limit-standard", {"settings": {"number_of_replicas": 0}})
    sc, body = es("POST", "/lab-limit-standard/_doc?refresh=true", doc, ok=None)
    out["standard"] = {"status": sc, "error": (body or {}).get("error", {}).get("reason")}
    # 2) logsdb index mode, default limit 1000 (ignore_dynamic_beyond_limit true)
    drop("lab-limit-logsdb")
    es("PUT", "/lab-limit-logsdb", {"settings": {"number_of_replicas": 0, "index.mode": "logsdb"}})
    sc, body = es("POST", "/lab-limit-logsdb/_doc?refresh=true", doc, ok=None)
    _, cnt = es("GET", "/lab-limit-logsdb/_count", {"query": {"exists": {"field": "attr.k1199"}}})
    _, ign = es("GET", "/lab-limit-logsdb/_search", {"size": 1, "_source": False, "fields": ["_ignored"]})
    _, st = es("GET", "/lab-limit-logsdb/_settings?include_defaults=true&filter_path=**.total_fields")
    _, m = es("GET", "/lab-limit-logsdb/_mapping")
    props = m["lab-limit-logsdb"]["mappings"]["properties"]
    attr_mapped = len(props.get("attr", {}).get("properties", {}))
    ignored = ign["hits"]["hits"][0].get("fields", {}).get("_ignored", [])
    out["logsdb"] = {"status": sc, "attr_keys_sent": 1200, "attr_keys_mapped": attr_mapped,
                     "exists_query_on_unmapped_key": cnt["count"], "_ignored_count": len(ignored),
                     "_ignored_sample": ignored[:3], "total_fields_settings": st}
    # 3) standard data stream with failure store
    drop("lab-limit-fs")
    es("PUT", "/_index_template/lab-limit-fs", {"index_patterns": ["lab-limit-fs"], "data_stream": {}, "priority": 500,
          "template": {"settings": {"number_of_replicas": 0, "index.mode": "standard"},
                       "data_stream_options": {"failure_store": {"enabled": True}}}})
    sc, body = es("POST", "/lab-limit-fs/_doc?refresh=true", doc, ok=None)
    time.sleep(1)
    es("POST", "/lab-limit-fs::failures/_refresh", ok=None)
    _, q = es("POST", "/_query", {"query": "FROM lab-limit-fs::failures | KEEP error.type, error.message | LIMIT 1"}, ok=None)
    out["standard_data_stream_with_failure_store"] = {"status": sc, "failure_store": (body or {}).get("failure_store"),
                                                      "failure_row": (q or {}).get("values")}
    for p in ("lab-limit-standard", "lab-limit-logsdb", "lab-limit-fs"):
        drop(p)
    es("DELETE", "/_index_template/lab-limit-fs", ok=None)
    save("exp_b_field_limit.json", out)


def gen_uuid_docs(n, keys_per_doc=3, pool=3000):
    rnd = random.Random(7)
    ids = [str(uuid.UUID(int=rnd.getrandbits(128))) for _ in range(pool)]
    for i in range(n):
        d = {"@timestamp": "2026-11-27T00:00:00Z", "message": f"m{i}"}
        stats = {}
        for k in rnd.sample(ids, keys_per_doc):
            stats[k] = {"last_event_published_time": "2026-11-27T00:00:00Z", "events": rnd.randint(1, 1000)}
        d["monitoring"] = {"dataset": stats}
        yield d


def bulk(index, docs):
    lines = []
    for d in docs:
        lines.append('{"create":{}}')
        lines.append(json.dumps(d))
    _, r = es("POST", f"/{index}/_bulk?refresh=true", raw="\n".join(lines) + "\n")
    errs = [it["create"].get("error", {}).get("reason") for it in r["items"] if it["create"].get("status", 200) >= 300]
    return len(r["items"]) - len(errs), errs[:1]


def exp_c():
    out = {}
    docs = list(gen_uuid_docs(2000))
    cases = {
        "object_default_limit": {"settings": {"number_of_replicas": 0}},
        "object_logsdb": {"settings": {"number_of_replicas": 0, "index.mode": "logsdb"}},
        "flattened": {"settings": {"number_of_replicas": 0},
                      "mappings": {"properties": {"monitoring": {"properties": {"dataset": {"type": "flattened"}}}}}},
    }
    for name, body in cases.items():
        idx = f"lab-uuid-{name.replace('_', '-')}"
        drop(idx)
        es("PUT", f"/{idx}", body)
        ok, errs = bulk(idx, docs)
        _, m = es("GET", f"/{idx}/_mapping")
        mapped = 0
        def walk(p):
            nonlocal mapped
            for v in p.values():
                mapped += 1
                if "properties" in v:
                    walk(v["properties"])
        walk(m[idx]["mappings"]["properties"])
        k = docs[0]["monitoring"]["dataset"]
        key = next(iter(k))
        q = {"query": {"term": {f"monitoring.dataset.{key}.events": k[key]["events"]}}}
        _, c = es("GET", f"/{idx}/_count", q, ok=None)
        last = docs[-1]["monitoring"]["dataset"]
        lkey = next(iter(last))
        _, c2 = es("GET", f"/{idx}/_count", {"query": {"term": {f"monitoring.dataset.{lkey}.events": last[lkey]["events"]}}}, ok=None)
        out[name] = {"docs_indexed": ok, "first_error": errs, "mapped_fields": mapped,
                     "term_query_hits_on_first_doc_key": (c or {}).get("count", c),
                     "term_query_hits_on_last_doc_key": (c2 or {}).get("count", c2)}
        drop(idx)
    save("exp_c_uuid_keys.json", out)


def exp_d():
    out = {}
    doc = {"@timestamp": "2026-11-27T00:00:00Z", "host": {"name": "h1", "os": {"name": "linux", "version": "6.8", "family": "debian"},
           "ip": "10.0.0.1"}, "process": {"name": "nginx", "pid": 10, "parent": {"name": "systemd", "pid": 1}},
           "source": {"ip": "10.0.0.2", "port": 5555, "geo": {"country_iso_code": "KR", "city_name": "Seoul"}},
           "event": {"category": "network", "dataset": "lab.ecs", "module": "lab"}}
    for name, mappings in {"default": {}, "subobjects_false": {"subobjects": False}}.items():
        idx = f"lab-ecs-{name.replace('_', '-')}"
        drop(idx)
        es("PUT", f"/{idx}", {"settings": {"number_of_replicas": 0}, "mappings": mappings})
        es("POST", f"/{idx}/_doc?refresh=true", doc)
        _, m = es("GET", f"/{idx}/_mapping")
        objects = leaves = 0
        def walk(p):
            nonlocal objects, leaves
            for v in p.values():
                if "properties" in v:
                    objects += 1
                    walk(v["properties"])
                else:
                    leaves += 1
                    leaves += len(v.get("fields", {}))
        walk(m[idx]["mappings"]["properties"])
        _, c = es("GET", f"/{idx}/_count", {"query": {"term": {"host.os.name": "linux"}}})
        out[name] = {"object_mappers": objects, "leaf_and_multi_fields": leaves, "counted_toward_limit": objects + leaves,
                     "query_host.os.name": c["count"]}
        drop(idx)
    save("exp_d_subobjects.json", out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--exp", required=True, choices="ABCD")
    a = ap.parse_args()
    {"A": exp_a, "B": exp_b, "C": exp_c, "D": exp_d}[a.exp]()
