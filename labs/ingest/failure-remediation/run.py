"""failure store 되살리기 시험. remediate.console과 같은 절차를 실행하고 건수를 기록한다."""
import json, os, re, time, requests
ES = os.environ.get("ES", "http://localhost:9200")
S = requests.Session()
here = os.path.dirname(os.path.abspath(__file__))

def es(m, p, b=None, ok=True):
    r = S.request(m, ES + p, data=json.dumps(b) if b is not None else None, headers={"Content-Type": "application/json"})
    if ok and r.status_code >= 300:
        raise RuntimeError(f"{m} {p} {r.status_code} {r.text[:300]}")
    return r.status_code, r.json() if r.text else None

def console_bodies():
    txt = open(os.path.join(here, "remediate.console"), encoding="utf-8").read()
    blocks = {}
    for m in re.finditer(r"^PUT _ingest/pipeline/(\S+)\n(\{.*?^\})", txt, re.S | re.M):
        blocks[m.group(1)] = json.loads(m.group(2))
    m = re.search(r"^PUT _index_template/lab-remedy\n(\{.*?^\})", txt, re.S | re.M)
    blocks["template"] = json.loads(m.group(1))
    return blocks

b = console_bodies()
es("DELETE", "/_data_stream/logs-lab.remedy-default", ok=False)
es("PUT", "/_ingest/pipeline/lab-remedy-default", b["lab-remedy-default"])
es("PUT", "/_index_template/lab-remedy", b["template"])
lines = []
good = bad_map = bad_pipe = 0
for i in range(300):
    if i % 10 == 3:
        d = {"@timestamp": f"2026-11-26T10:{i//60:02d}:{i%60:02d}Z", "message": f"user=u{i} action=login", "response": f"{i}kb"}; bad_map += 1
    elif i % 10 == 7:
        d = {"@timestamp": f"2026-11-26T10:{i//60:02d}:{i%60:02d}Z", "message": f"broken line {i}", "response": {"bytes": i}}; bad_pipe += 1
    else:
        d = {"@timestamp": f"2026-11-26T10:{i//60:02d}:{i%60:02d}Z", "message": f"user=u{i} action=login", "response": {"bytes": i}}; good += 1
    lines += ['{"create":{}}', json.dumps(d)]
es("POST", "/logs-lab.remedy-default/_bulk?refresh=true", None) if False else None
r = S.post(ES + "/logs-lab.remedy-default/_bulk?refresh=true", data="\n".join(lines) + "\n", headers={"Content-Type": "application/x-ndjson"}).json()
fs_used = sum(1 for it in r["items"] if it["create"].get("failure_store") == "used")
es("POST", "/logs-lab.remedy-default::failures/_refresh")
_, agg = es("POST", "/logs-lab.remedy-default::failures/_search", {"size": 0, "aggs": {"kind": {"terms": {"field": "error.type"}}, "no_pipeline": {"missing": {"field": "error.pipeline"}}}})
out = {"sent": 300, "expected_good": good, "expected_mapping_fail": bad_map, "expected_pipeline_fail": bad_pipe,
       "failure_store_used": fs_used,
       "failure_types": {x["key"]: x["doc_count"] for x in agg["aggregations"]["kind"]["buckets"]},
       "failures_without_error_pipeline(mapping)": agg["aggregations"]["no_pipeline"]["doc_count"]}
es("POST", "/logs-lab.remedy-default::failures/_rollover")
# 원인 수정: dissect 패턴이 맞지 않는 줄은 그대로 두도록 default pipeline을 고친다
fixed = {"processors": [{"dissect": {"field": "message", "pattern": "user=%{user.name} action=%{event.action}", "ignore_failure": True}}]}
es("PUT", "/_ingest/pipeline/lab-remedy-default", fixed)
es("PUT", "/_ingest/pipeline/lab-remedy-restore", b["lab-remedy-restore"])
_, sim = es("POST", "/_ingest/_simulate?pipeline=lab-remedy-restore", {"docs": [{"_index": "x", "_source": {"@timestamp": "2026-11-27T00:00:00Z", "document": {"index": "logs-lab.remedy-default", "source": {"@timestamp": "2026-11-26T10:00:00Z", "message": "user=kim action=login", "response": "12kb"}}, "error": {"type": "document_parsing_exception"}}}]})
out["simulate"] = {"index": sim["docs"][0]["doc"]["_index"], "source": sim["docs"][0]["doc"]["_source"], "executed_pipelines": sim["docs"][0]["doc"].get("executed_pipelines")}
_, rx = es("POST", "/_reindex?refresh=true", {"source": {"index": "logs-lab.remedy-default::failures", "query": {"range": {"@timestamp": {"lte": "now"}}}},
                                         "dest": {"index": "logs-lab.remedy-default", "op_type": "create", "pipeline": "lab-remedy-restore"}})
out["reindex"] = {k: rx.get(k) for k in ("total", "created", "version_conflicts", "failures")}
es("POST", "/logs-lab.remedy-default::failures/_refresh")
_, c = es("GET", "/logs-lab.remedy-default/_count")
_, cf = es("GET", "/logs-lab.remedy-default::failures/_count")
_, conv = es("GET", "/logs-lab.remedy-default/_count", {"query": {"exists": {"field": "labels.response_raw"}}})
_, usr = es("GET", "/logs-lab.remedy-default/_count", {"query": {"exists": {"field": "user.name"}}})
_, mode = es("GET", "/logs-lab.remedy-default/_settings?filter_path=*.settings.index.mode")
out["after"] = {"data_stream_docs": c["count"], "failure_store_docs_total(including old)": cf["count"],
                "docs_with_labels.response_raw": conv["count"], "docs_with_user.name": usr["count"], "index_mode": mode}
os.makedirs(os.path.join(here, "results"), exist_ok=True)
json.dump(out, open(os.path.join(here, "results", "remediation.json"), "w"), indent=2, ensure_ascii=False)
print(json.dumps(out, indent=2, ensure_ascii=False))
es("DELETE", "/_data_stream/logs-lab.remedy-default", ok=False)
