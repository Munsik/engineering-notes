"""데이터 설계 컬렉션 공통 synthetic 로그 생성기.

같은 seed와 옵션이면 항상 같은 문서를 만든다. 실제 고객 데이터나 그로부터 유도한 값은 쓰지 않는다.

옵션
  hosts         host.name 개수(cardinality)
  extra_fields  attr.f001 같은 추가 필드 수. 절반은 keyword, 절반은 long
  msg           'short'(message 평균 약 70바이트, 문서 평균 약 760바이트) 또는 'long'(message 1.5KB에서 2.5KB, stack trace 형태)
  obj_array     True면 links 필드에 객체 배열(trace_id, span_id 쌍)을 넣는다
  tenants       0보다 크면 tenant.id 필드를 넣는다(04 multi-tenant 실험용)

사용 예
  python3 loggen.py --n 300000 --hosts 50 --out base.ndjson
"""
import argparse
import json
import random
import zlib
from datetime import datetime, timedelta, timezone

SERVICES = ["checkout", "cart", "payment", "search", "auth", "catalog", "shipping", "notify"]
LEVELS = ["INFO"] * 80 + ["WARN"] * 12 + ["ERROR"] * 6 + ["DEBUG"] * 2
METHODS = ["GET"] * 70 + ["POST"] * 20 + ["PUT"] * 6 + ["DELETE"] * 4
STATUS = [200] * 85 + [201] * 4 + [304] * 3 + [400] * 2 + [404] * 3 + [500] * 2 + [503] * 1
PATHS = ["/api/v1/orders", "/api/v1/cart", "/api/v1/items", "/api/v1/login", "/api/v1/search",
         "/api/v1/payments", "/api/v1/users", "/health", "/api/v2/recommendations", "/static/app.js"]
REGIONS = ["ap-northeast-2a", "ap-northeast-2b", "ap-northeast-2c"]
AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "okhttp/4.12.0", "curl/8.10.1", "Go-http-client/2.0",
]
TEMPLATES = [
    "{method} {path}/{id} completed status={status} duration={ms}ms user={user}",
    "connection pool exhausted for datasource {svc}-db, active={a} idle=0 waiting={w}",
    "cache miss key={svc}:{id} ttl=300 fallback=origin latency={ms}ms",
    "user {user} authenticated via oauth2 client={svc}-web session={sid}",
    "timeout calling {svc}-backend after {ms}ms retry={r}/3 trace={tid}",
    "order {id} state changed from PENDING to CONFIRMED by {user}",
    "slow query on table {svc}_events took {ms}ms rows={a}",
    "published event {svc}.updated partition={r} offset={off}",
    "rate limit reached for client {ip} bucket={svc} remaining=0",
    "gc pause young generation {ms}ms heap_used={a}MB",
]
STACK = [
    "\tat com.example.{svc}.service.OrderService.process(OrderService.java:{n})",
    "\tat com.example.{svc}.repository.JdbcRepository.query(JdbcRepository.java:{n})",
    "\tat org.springframework.transaction.support.TransactionTemplate.execute(TransactionTemplate.java:{n})",
    "\tat java.base/java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:{n})",
    "\tat io.netty.channel.AbstractChannelHandlerContext.invokeChannelRead(AbstractChannelHandlerContext.java:{n})",
    "Caused by: java.net.SocketTimeoutException: Read timed out after {ms}ms",
]


def _h(s):
    return zlib.crc32(s.encode())


def hexid(rnd, n):
    return "%0*x" % (n, rnd.getrandbits(n * 4))


def gen(n, hosts=50, extra_fields=0, msg="short", obj_array=False, tenants=0, seed=42,
        start="2026-11-01T00:00:00Z", step_ms=10, offset=0):
    rnd = random.Random(seed)
    t0 = datetime.fromisoformat(start.replace("Z", "+00:00")) + timedelta(milliseconds=offset * step_ms)
    users = ["user%04d" % i for i in range(2000)]
    host_names = ["host-%05d" % i for i in range(hosts)]
    host_svc = {h: SERVICES[i % len(SERVICES)] for i, h in enumerate(host_names)}
    host_ip = {h: "10.%d.%d.%d" % (i // 65536 % 256, i // 256 % 256, i % 256) for i, h in enumerate(host_names)}
    extra_card = [rnd.choice([5, 20, 100, 1000]) for _ in range(extra_fields)]
    for i in range(n):
        ts = t0 + timedelta(milliseconds=i * step_ms + rnd.randint(0, step_ms - 1))
        h = host_names[rnd.randrange(hosts)]
        svc = host_svc[h]
        status = rnd.choice(STATUS)
        ms = int(rnd.expovariate(1 / 80)) + 1
        tid = hexid(rnd, 32)
        msg_text = rnd.choice(TEMPLATES).format(
            method=rnd.choice(METHODS), path=rnd.choice(PATHS), id=rnd.randint(1, 10_000_000),
            status=status, ms=ms, user=rnd.choice(users), svc=svc, a=rnd.randint(1, 500),
            w=rnd.randint(1, 50), sid=hexid(rnd, 16), r=rnd.randint(0, 11), tid=tid[:16],
            off=rnd.randint(1, 10**9), ip="203.0.113.%d" % rnd.randint(1, 254))
        if msg == "long":
            lines = [msg_text, "java.lang.IllegalStateException: request failed for " + svc]
            while sum(len(x) for x in lines) < rnd.randint(1500, 2500):
                lines.append(rnd.choice(STACK).format(svc=svc, n=rnd.randint(20, 900), ms=ms))
            msg_text = "\n".join(lines)
        doc = {
            "@timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (ts.microsecond // 1000),
            "host": {"name": h, "ip": host_ip[h]},
            "service": {"name": svc, "version": "1.%d.0" % (_h(svc) % 5)},
            "log": {"level": rnd.choice(LEVELS), "logger": "com.example.%s.Handler" % svc},
            "message": msg_text,
            "event": {"dataset": "%s.app" % svc, "duration": ms * 1_000_000},
            "http": {"request": {"method": rnd.choice(METHODS)}, "response": {"status_code": status, "bytes": rnd.randint(200, 50_000)}},
            "url": {"path": rnd.choice(PATHS)},
            "user_agent": {"original": rnd.choice(AGENTS)},
            "client": {"ip": "198.51.100.%d" % rnd.randint(1, 254)},
            "user": {"name": rnd.choice(users)},
            "trace": {"id": tid},
            "process": {"pid": 1000 + (_h(h) % 30000)},
            "container": {"id": hexid(random.Random(h), 12)},
            "cloud": {"region": REGIONS[_h(h) % 3]},
            "labels": {"env": "prod" if rnd.random() < 0.9 else "stage"},
        }
        if tenants:
            doc["tenant"] = {"id": "tenant-%03d" % rnd.randrange(tenants)}
        if extra_fields:
            attr = {}
            for k in range(extra_fields):
                key = "f%03d" % (k + 1)
                v = rnd.randrange(extra_card[k])
                attr[key] = ("v%d" % v) if k % 2 == 0 else v
            doc["attr"] = attr
        if obj_array:
            doc["links"] = [{"trace_id": hexid(rnd, 32), "span_id": hexid(rnd, 16)} for _ in range(rnd.randint(1, 3))]
        yield doc


def mapping(extra_fields=0, obj_array=False, tenants=0):
    kw = {"type": "keyword"}
    props = {
        "@timestamp": {"type": "date"},
        "host": {"properties": {"name": kw, "ip": {"type": "ip"}}},
        "service": {"properties": {"name": kw, "version": kw}},
        "log": {"properties": {"level": kw, "logger": kw}},
        "message": {"type": "match_only_text"},
        "event": {"properties": {"dataset": kw, "duration": {"type": "long"}}},
        "http": {"properties": {"request": {"properties": {"method": kw}},
                                "response": {"properties": {"status_code": {"type": "long"}, "bytes": {"type": "long"}}}}},
        "url": {"properties": {"path": kw}},
        "user_agent": {"properties": {"original": kw}},
        "client": {"properties": {"ip": {"type": "ip"}}},
        "user": {"properties": {"name": kw}},
        "trace": {"properties": {"id": kw}},
        "process": {"properties": {"pid": {"type": "long"}}},
        "container": {"properties": {"id": kw}},
        "cloud": {"properties": {"region": kw}},
        "labels": {"properties": {"env": kw}},
    }
    if tenants:
        props["tenant"] = {"properties": {"id": kw}}
    if extra_fields:
        props["attr"] = {"properties": {("f%03d" % (k + 1)): (kw if k % 2 == 0 else {"type": "long"}) for k in range(extra_fields)}}
    if obj_array:
        props["links"] = {"properties": {"trace_id": kw, "span_id": kw}}
    return {"properties": props}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=100000)
    ap.add_argument("--hosts", type=int, default=50)
    ap.add_argument("--extra-fields", type=int, default=0)
    ap.add_argument("--msg", default="short", choices=["short", "long"])
    ap.add_argument("--obj-array", action="store_true")
    ap.add_argument("--tenants", type=int, default=0)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    with open(a.out, "w") as f:
        for d in gen(a.n, a.hosts, a.extra_fields, a.msg, a.obj_array, a.tenants, a.seed):
            f.write('{"create":{}}\n')
            f.write(json.dumps(d, separators=(",", ":")) + "\n")
