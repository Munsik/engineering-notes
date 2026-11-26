"""순번을 붙인 syslog를 TCP 또는 UDP로 보낸다. 보낸 건수와 순번 범위를 결과 파일로 남긴다.

  python3 send.py --proto udp --host 10.0.0.100 --port 514 --rate 5000 --seconds 600 --run run-01

메시지 형식(RFC 5424, structured data 없이 본문에 key=value):
  <134>1 2026-11-26T10:00:00.123+09:00 sender-01 labsend - - - run=run-01 seq=123 payload=...

수신 쪽 ingest pipeline에서 run, seq를 labels.run, labels.seq(long)로 꺼내 저장한다.
"""
import argparse
import json
import socket
import time
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--proto", choices=["udp", "tcp"], default="udp")
    ap.add_argument("--host", required=True)
    ap.add_argument("--port", type=int, default=514)
    ap.add_argument("--rate", type=int, default=1000, help="초당 메시지 수")
    ap.add_argument("--seconds", type=int, default=60)
    ap.add_argument("--run", required=True)
    ap.add_argument("--payload", type=int, default=200, help="본문 패딩 길이")
    ap.add_argument("--start-seq", type=int, default=1)
    a = ap.parse_args()

    if a.proto == "udp":
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        send = lambda b: sock.sendto(b, (a.host, a.port))
    else:
        sock = socket.create_connection((a.host, a.port))
        send = lambda b: sock.sendall(b + b"\n")  # newline framing

    pad = "x" * a.payload
    seq, sent, errors = a.start_seq, 0, 0
    t0 = time.time()
    end = t0 + a.seconds
    while time.time() < end:
        tick = time.time()
        for _ in range(a.rate):
            ts = datetime.now(KST).isoformat(timespec="milliseconds")
            msg = f"<134>1 {ts} sender-01 labsend - - - run={a.run} seq={seq} payload={pad}".encode()
            try:
                send(msg)
                sent += 1
            except OSError:
                errors += 1
            seq += 1
        sleep = 1 - (time.time() - tick)
        if sleep > 0:
            time.sleep(sleep)
    result = {"run": a.run, "proto": a.proto, "first_seq": a.start_seq, "last_seq": seq - 1,
              "sent": sent, "send_errors": errors, "seconds": round(time.time() - t0, 1)}
    with open(f"sent-{a.run}.json", "w") as f:
        json.dump(result, f)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
