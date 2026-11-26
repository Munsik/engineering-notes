# 공통 synthetic 로그 생성기

데이터 설계 컬렉션의 03, 04, 05 실측이 같이 쓰는 생성기입니다. 실제 고객 데이터나 그로부터 유도한 값은 쓰지 않습니다.
seed와 옵션이 같으면 항상 같은 문서가 나옵니다.

| 옵션 | 의미 | 기본값 |
| --- | --- | --- |
| `--n` | 문서 수 | 100000 |
| `--hosts` | `host.name` 개수 | 50 |
| `--extra-fields` | `attr.f001`부터 추가하는 필드 수. 절반은 keyword, 절반은 long | 0 |
| `--msg` | `short`(message 평균 약 70바이트) 또는 `long`(1.5KB에서 2.5KB stack trace) | `short` |
| `--obj-array` | `links`에 객체 배열 추가 | 꺼짐 |
| `--tenants` | 0보다 크면 `tenant.id` 추가 | 0 |
| `--seed` | 난수 seed | 42 |

```bash
python3 loggen.py --n 300000 --hosts 50 --out base.ndjson
```

출력은 `_bulk`에 바로 보낼 수 있는 NDJSON(`{"create":{}}` 줄 포함)입니다. Python에서는 `loggen.gen()`과 `loggen.mapping()`을 직접 씁니다.
기본 옵션의 문서는 JSON 기준 약 760바이트입니다.
