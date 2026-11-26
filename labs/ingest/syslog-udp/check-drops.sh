#!/bin/sh
# 커널 UDP 카운터를 간격을 두고 두 번 읽어 증가분을 출력한다
INTERVAL=${1:-60}
snap() { awk '/^Udp:/{getline; print $4, $6, $7}' /proc/net/snmp; }  # InErrors RcvbufErrors SndbufErrors
set -- $(snap); A1=$1; A2=$2
sleep "$INTERVAL"
set -- $(snap); echo "InErrors+$(( $1 - A1 )) RcvbufErrors+$(( $2 - A2 )) in ${INTERVAL}s"
