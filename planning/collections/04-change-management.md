# 4. 바꿀 때 (변경 관리)

한 번 하면 몇 년간 다시 하지 않는 일이 많아 조직 안에 경험이 잘 쌓이지 않습니다.
2026-11-28에 범위를 넓혔습니다. 처음 계획한 3편(업그레이드, 보안 공지, 이관)에 managed 자산, 데이터 정의 변경, Kibana 객체와 설정, dashboard CI/CD, 클러스터 구성 변경, 변경 절차를 더해 10편으로 발행했습니다.

- 폴더: `src/content/docs/change/`
- labs: `labs/change/`
- 캡처 목록: [`../captures/change-captures.md`](../captures/change-captures.md)
- 기준: Elasticsearch, Kibana 9.5.x(발행 시점 최신 9.5.7). 9.6은 미출시라 공식 문서에 9.6+로 표시된 기능은 넣지 않았음

## 구조

변경 대상을 네 층(플랫폼, 클러스터 구성, 데이터 정의, Kibana 객체와 설정)으로 나누고, Elastic이 설치하고 갱신하는 managed 자산을 별도 축으로 둡니다.

| 번호 | 파일 | 답하는 질문 |
| --- | --- | --- |
| 4-1 | `01-change-map.md` | 무엇이 바뀌고 원본은 어디인가. 되돌릴 수 있는 것과 없는 것. 도구 선택, drift, audit, CI 계정 |
| 4-2 | `02-change-process.md` | 변경 하나를 어떤 순서로 하고 언제 되돌리나 |
| 4-3 | `03-managed-assets.md` | 업그레이드 뒤 직접 고친 template, pipeline, ILM, dashboard, prebuilt rule이 왜 사라지고 어디에 고쳐야 하나 |
| 4-4 | `04-data-definitions.md` | 데이터 정의 변경은 언제 반영되고 무엇이 깨지나 |
| 4-5 | `05-kibana-objects.md` | Kibana 객체를 어떻게 코드로 두고 옮기나. rule과 API key, encryption key |
| 4-6 | `06-dashboards-as-code.md` | dashboard를 Git과 CI/CD로 어떻게 배포하나 |
| 4-7 | `07-cluster-config.md` | 노드, 인증서, 라이선스, JDK, plugin, settings, 보안 구성, 저장소를 바꿀 때 |
| 4-8 | `08-major-upgrade.md` | 되돌릴 수 없는 업그레이드의 롤백 대안과 절차 |
| 4-9 | `09-security-advisory.md` | 보안 공지의 해당 여부 판단과 버전 선택, 보고 |
| 4-10 | `10-data-migration.md` | 다른 플랫폼, 구버전 데이터를 옮기고 검증하는 방법 |

## 근거

- 공식 문서와 API reference: 각 글의 참고 문서
- 소스 코드: built-in template 구성과 덮어쓰기 조건(`x-pack/plugin/core/template-resources`, `IndexTemplateRegistry.java`), REST API spec의 stability와 visibility(`_ingest/_simulate` experimental, node shutdown API private)
- Terraform provider 리소스 목록: `elastic/terraform-provider-elasticstack`의 `docs/resources`
- 사내 자료에서 얻은 현장 사례는 업종 수준으로만 썼고, 사실 문장은 공개 출처로 다시 확인한 것만 남김. 발표 전 기능과 내부 계획은 넣지 않음

## 남은 작업

- [ ] 화면 캡처 18건 ([목록](../captures/change-captures.md))
- [ ] labs의 `.console`과 스크립트를 9.5 lab에서 실행해 200 확인
- [ ] 확인 필요로 남긴 항목 재확인
  - [ ] integration을 이전 버전으로 되돌릴 때의 동작(4-1)
  - [ ] built-in 자산을 업그레이드 전에 기준 정의로 되돌리는 방법(4-3)
  - [ ] 시간 범위를 저장하지 않는 dashboard를 API로 정의하는 방법(4-6)
  - [ ] role 변경이 기존 API key 권한에 미치는 영향(4-7)
- [ ] 9.6 출시 후 갱신: Data views v2 API, Discover sessions API, dashboard 가져오기 UI, Export JSON GA
