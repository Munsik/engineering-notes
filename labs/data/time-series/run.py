"""07. Metrics와 TSDS 실측 스크립트(단일 노드).

  python3 run.py --exp A   # 받는 시간 범위: 지금, 3시간 전, 1시간 뒤. failure store 유무
  python3 run.py --exp B   # 같은 dimension과 시각의 중복, 사용자 지정 _id
  python3 run.py --exp C   # 과거 backing index 자동 생성(data_stream.past_tsdb_index_creation_enabled, 9.5)
  python3 run.py --exp D   # 같은 metrics를 standard 대 time_series로 저장한 크기
  python3 run.py --exp E   # downsample 전후 문서 수와 크기

전제: Elasticsearch 9.5.x 단일 노드, 보안 끔. ES 환경변수로 주소를 바꿀 수 있다.
"""
import argparse, json, os, random, time
from datetime import datetime, timedelta, timezone
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


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


NOW = lambda: datetime.now(timezone.utc).replace(microsecond=0)

MAPPINGS = {"properties": {
    "@timestamp": {"type": "date"},
    "host": {"properties": {"name": {"type": "keyword", "time_series_dimension": True}}},
    "metric": {"properties": {"name": {"type": "keyword", "time_series_dimension": True}}},
    "cpu": {"properties": {"pct": {"type": "double", "time_series_metric": "gauge"}}},
    "net": {"properties": {"bytes": {"type": "long", "time_series_metric": "counter"}}},
}}


def tsds(name, failure_store=False, extra=None, mode="time_series"):
    es("DELETE", f"/_data_stream/{name}", ok=None)
    settings = {"number_of_replicas": 0, "index.mode": mode}
    if mode == "time_series":
        settings["index.routing_path"] = ["host.name", "metric.name"]
    settings.update(extra or {})
    tpl = {"index_patterns": [name], "data_stream": {}, "priority": 500,
           "template": {"settings": settings, "mappings": MAPPINGS}}
    if failure_store:
        tpl["template"]["data_stream_options"] = {"failure_store": {"enabled": True}}
    es("PUT", f"/_index_template/{name}", tpl)
    es("PUT", f"/_data_stream/{name}")


def cleanup(name):
    es("DELETE", f"/_data_stream/{name}", ok=None)
    es("DELETE", f"/_index_template/{name}", ok=None)


def doc(ts, host="h1", cpu=0.5, nb=100):
    return {"@timestamp": iso(ts), "host": {"name": host}, "metric": {"name": "system"},
            "cpu": {"pct": cpu}, "net": {"bytes": nb}}


def put(name, d, op="create", _id=None):
    meta = {op: {}}
    if _id:
        meta[op]["_id"] = _id
    raw = json.dumps(meta) + "\n" + json.dumps(d) + "\n"
    _, r = es("POST", f"/{name}/_bulk?refresh=true", raw=raw)
    it = r["items"][0][op]
    return {"status": it.get("status"), "failure_store": it.get("failure_store"),
            "error": (it.get("error") or {}).get("reason", "")[:160] or None}


def exp_a():
    out = {}
    for fs in (False, True):
        name = f"metrics-lab.range{'-fs' if fs else ''}-default"
        tsds(name, failure_store=fs)
        _, ds = es("GET", f"/_data_stream/{name}")
        n = NOW()
        r = {"time_series_ranges": ds["data_streams"][0].get("time_series"),
             "now": put(name, doc(n)),
             "minus_1h": put(name, doc(n - timedelta(hours=1))),
             "minus_3h": put(name, doc(n - timedelta(hours=3))),
             "plus_1h": put(name, doc(n + timedelta(hours=1)))}
        out["with_failure_store" if fs else "without_failure_store"] = r
        cleanup(name)
    save("exp_a_time_range.json", out)


def exp_b():
    name = "metrics-lab.dup-default"
    tsds(name)
    n = NOW()
    out = {"first": put(name, doc(n)),
           "same_dims_same_time_other_value": put(name, doc(n, cpu=0.9)),
           "same_dims_next_second": put(name, doc(n + timedelta(seconds=1))),
           "custom_id": put(name, doc(n + timedelta(seconds=2)), _id="my-fingerprint")}
    _, c = es("GET", f"/{name}/_count")
    out["docs"] = c["count"]
    cleanup(name)
    save("exp_b_duplicates.json", out)


def exp_c():
    name = "metrics-lab.past-default"
    out = {}
    es("PUT", "/_cluster/settings", {"persistent": {"data_stream.past_tsdb_index_creation_enabled": False}})
    tsds(name, extra={})
    n = NOW()
    out["setting_off_minus_5h"] = put(name, doc(n - timedelta(hours=5)))
    es("PUT", "/_cluster/settings", {"persistent": {"data_stream.past_tsdb_index_creation_enabled": True}})
    out["setting_on_minus_5h"] = put(name, doc(n - timedelta(hours=5)))
    out["setting_on_minus_5h_again"] = put(name, doc(n - timedelta(hours=5, minutes=-1)))
    out["setting_on_minus_30d"] = put(name, doc(n - timedelta(days=30)))
    _, ds = es("GET", f"/_data_stream/{name}")
    d = ds["data_streams"][0]
    out["backing_indices"] = [i["index_name"] for i in d["indices"]]
    out["time_series_ranges"] = d.get("time_series")
    _, st = es("GET", f"/{name}/_settings?filter_path=*.settings.index.time_series,*.settings.index.lifecycle")
    out["index_settings"] = st
    es("PUT", "/_cluster/settings", {"persistent": {"data_stream.past_tsdb_index_creation_enabled": None}})
    cleanup(name)
    save("exp_c_past_index.json", out)


def gen_metrics(start, hosts=200, minutes=360, step_s=10, seed=3):
    rnd = random.Random(seed)
    counters = {h: rnd.randint(0, 10**9) for h in range(hosts)}
    t = start
    end = start + timedelta(minutes=minutes)
    while t < end:
        for h in range(hosts):
            counters[h] += rnd.randint(1000, 50000)
            yield doc(t, host=f"host-{h:04d}", cpu=round(rnd.random(), 3), nb=counters[h])
        t += timedelta(seconds=step_s)


def load(name, docs, batch=5000):
    buf = []
    n = 0
    for d in docs:
        buf.append('{"create":{}}')
        buf.append(json.dumps(d, separators=(",", ":")))
        if len(buf) >= batch * 2:
            es("POST", f"/{name}/_bulk", raw="\n".join(buf) + "\n")
            n += len(buf) // 2
            buf = []
    if buf:
        es("POST", f"/{name}/_bulk", raw="\n".join(buf) + "\n")
        n += len(buf) // 2
    es("POST", f"/{name}/_refresh")
    return n


def size(name):
    es("POST", f"/{name}/_forcemerge?max_num_segments=1")
    _, s = es("GET", f"/{name}/_stats/store,docs")
    return {"docs": s["_all"]["primaries"]["docs"]["count"], "store_bytes": s["_all"]["primaries"]["store"]["size_in_bytes"]}


def exp_d():
    out = {}
    start = NOW() - timedelta(minutes=110)
    for mode in ("standard", "logsdb", "time_series"):
        name = f"metrics-lab.size{mode.replace('_', '')}-default"
        tsds(name, mode=mode, extra={} if mode == "time_series" else {})
        t0 = time.time()
        n = load(name, gen_metrics(start, hosts=200, minutes=100))
        out[mode] = {"indexed": n, "load_s": round(time.time() - t0, 1), **size(name)}
        out[mode]["bytes_per_doc"] = round(out[mode]["store_bytes"] / out[mode]["docs"], 1)
        cleanup(name)
    _, lic = es("GET", "/_license")
    out["license"] = lic["license"]["type"]
    save(f"exp_d_size_{out['license']}.json", out)


def exp_e():
    name = "metrics-lab.ds-default"
    out = {}
    es("PUT", "/_cluster/settings", {"persistent": {"data_stream.past_tsdb_index_creation_enabled": True}})
    tsds(name)
    start = NOW() - timedelta(hours=8)
    n = load(name, gen_metrics(start, hosts=200, minutes=60))
    _, ds = es("GET", f"/_data_stream/{name}")
    past = [i["index_name"] for i in ds["data_streams"][0]["indices"]]
    out["backing_indices"] = past
    src = past[0]
    out["source"] = {"index": src, **size(src)}
    es("PUT", f"/{src}/_block/write")
    t0 = time.time()
    sc, r = es("POST", f"/{src}/_downsample/{src}-ds-5m", {"fixed_interval": "5m"}, ok=None)
    out["downsample_status"] = sc
    out["downsample_error"] = (r or {}).get("error", {}).get("reason") if sc >= 300 else None
    if sc < 300:
        out["downsample_s"] = round(time.time() - t0, 1)
        out["target"] = {"index": f"{src}-ds-5m", **size(f"{src}-ds-5m")}
        _, sample = es("GET", f"/{src}-ds-5m/_search", {"size": 1, "query": {"term": {"host.name": "host-0001"}}})
        out["target_sample_source"] = sample["hits"]["hits"][0]["_source"]
        es("DELETE", f"/{src}-ds-5m", ok=None)
    es("PUT", "/_cluster/settings", {"persistent": {"data_stream.past_tsdb_index_creation_enabled": None}})
    cleanup(name)
    save("exp_e_downsample.json", out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--exp", required=True, choices="ABCDE")
    a = ap.parse_args()
    {"A": exp_a, "B": exp_b, "C": exp_c, "D": exp_d, "E": exp_e}[a.exp]()
