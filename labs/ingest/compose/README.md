# compose lab

03, 04, 05, 06, 08의 실측과 화면에 쓴 구성입니다. Elasticsearch, Kibana, Fleet Server는 Elastic Cloud를 쓰고, 나머지를 Docker로 띄웁니다.

| 컨테이너 | 역할 |
| --- | --- |
| `lab-recv-01`, `lab-recv-02` | 수신 전용 Agent(정책 `lab-syslog-receivers`). Custom UDP Logs가 5514를 받아 Fleet Logstash 출력 `lab-logstash`로 보냄 |
| `lab-ls-01`, `lab-ls-02` | Logstash. `elastic_agent` input 5044, Elasticsearch로 출력 |
| `lab-host-01` | 지표 수집 Agent(정책 `lab-linux-hosts`). Logstash integration으로 두 Logstash의 9600을 수집 |
| `sender` | `../_sender/send.py`로 순번을 붙인 UDP syslog 송신 |

## 준비

1. Kibana Dev Tools에서 `lab-setup.console`과 `../_sender/labsend-pipeline.console`을 실행합니다.
2. Fleet에서 만듭니다.
   - 출력 `lab-logstash`: Logstash, hosts `lab-ls-01:5044`, `lab-ls-02:5044`, Advanced YAML `loadbalance: true`(lab이라 SSL 끔)
   - 정책 `lab-syslog-receivers`: Output for integrations를 `lab-logstash`로. Custom UDP Logs(listen `0.0.0.0:5514`, dataset `lab.syslog`)
   - 정책 `lab-linux-hosts`: Logstash integration 두 개(URL `http://lab-ls-01:9600`, `http://lab-ls-02:9600`, metrics만)
3. `.env.example`을 `.env`로 복사하고 Fleet URL, Elasticsearch 주소, 정책별 enrollment token, API key를 채웁니다.

## 실행

```bash
docker compose up -d
./run-capture.sh   # 약 25분. 송신, Logstash 한 대 정지와 재시작, 고속 송신
docker compose down -v
```

Docker로 띄운 Agent는 Fleet의 업그레이드 대상이 아니라고 보고됩니다(`upgradeable: false`). 08의 업그레이드 화면은 대화 상자만 열어 보고 실행하지 않았습니다.
