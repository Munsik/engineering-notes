"""같은 문서를 다섯 조합에 넣고 _source가 어떻게 돌아오는지 비교한다.

  python3 fidelity.py > results/fidelity.json
"""
import json
import sys

import requests

ES = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:9200"
S = requests.Session()
CONFIGS = {
    "std": {"index.mode": "standard"},
    "std-syn": {"index.mode": "standard", "index.mapping.source.mode": "synthetic"},
    "logsdb": {"index.mode": "logsdb"},
    "columnar": {"index.mode": "logsdb_columnar"},
}
DOC = {
    "@timestamp": "2026-11-26T10:00:00.000Z",
    "host": {"name": "host-1"},
    "message": "dns lookup ok",
    "dns": {"answers": ["10.0.0.3", "10.0.0.1", "10.0.0.3"]},
    "links": [{"trace_id": "t1", "span_id": "s1"}, {"trace_id": "t2", "span_id": "s2"}],
    "service.name": "checkout",
    "debug": {"raw": {"k": "v"}},
}
MAPPING = {"dynamic": True, "properties": {
    "host": {"properties": {"name": {"type": "keyword"}}},
    "message": {"type": "match_only_text"},
    "dns": {"properties": {"answers": {"type": "ip"}}},
    "links": {"properties": {"trace_id": {"type": "keyword"}, "span_id": {"type": "keyword"}}},
    "debug": {"type": "object", "enabled": False},
}}
out = {"input": DOC}
for name, settings in CONFIGS.items():
    ds = f"fid-{name}"
    S.delete(f"{ES}/_data_stream/{ds}")
    S.put(f"{ES}/_index_template/{ds}", json={"index_patterns": [ds], "data_stream": {}, "priority": 500,
          "template": {"settings": {**settings, "number_of_replicas": 0}, "mappings": MAPPING}}).raise_for_status()
    r = S.post(f"{ES}/{ds}/_doc?refresh=true", json=DOC)
    if r.status_code >= 300:
        out[name] = {"error": r.json()}
        continue
    hit = S.post(f"{ES}/{ds}/_search", json={"size": 1}).json()["hits"]["hits"][0]
    out[name] = hit["_source"]
    S.delete(f"{ES}/_data_stream/{ds}")
print(json.dumps(out, indent=1, ensure_ascii=False))
