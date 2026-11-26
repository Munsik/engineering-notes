#!/bin/sh
# 캡처용 시나리오. 약 25분 걸린다. 터미널을 닫지 말고 끝날 때까지 둔다
# 0분   lab-recv-01로 초당 2,000건 UDP 송신 시작(25분)
# 8분   lab-ls-01 정지(Logstash 한 대 장애)
# 13분  lab-ls-01 다시 시작
# 17분  lab-recv-02로 초당 80,000건 2분 송신(UDP drop 유도)
set -e
cd "$(dirname "$0")"
log() { echo "$(date '+%H:%M:%S') $*"; }

log "송신 시작 cap-11"
docker compose run -d --rm --name lab-sender-1 sender --host lab-recv-01 --port 5514 --rate 2000 --seconds 1500 --run cap-11 >/dev/null
sleep 480
log "lab-ls-01 정지"
docker compose stop lab-ls-01
sleep 300
log "lab-ls-01 시작"
docker compose start lab-ls-01
sleep 240
log "고속 송신 cap-12"
docker compose run --rm --name lab-sender-2 sender --host lab-recv-02 --port 5514 --rate 80000 --seconds 120 --run cap-12
sleep 360
log "끝. 송신 결과는 ../_sender/sent-cap-11.json, ../_sender/sent-cap-12.json"
