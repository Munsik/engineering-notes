# planning

이 폴더는 Engineering Notes에 쓸 글의 작업 계획과 TO-DO 목록을 관리합니다.
사이트 독자를 위한 내용이 아니라 글쓴이가 작업을 추적하기 위한 공간입니다.

## 사이트에 노출되지 않는 이유

- Starlight는 `src/content.config.ts`의 `docsLoader()`로 `src/content/docs/` 아래 파일만 페이지로 만듭니다. 이 폴더는 그 밖에 있으므로 빌드 결과(`dist/`)에 들어가지 않습니다.
- `public/`에 있는 파일은 그대로 배포되므로, 계획 문서를 `public/`이나 `src/content/docs/` 아래로 옮기지 않습니다.
- `.github/workflows/deploy.yml`의 `paths-ignore`에 `planning/**`를 넣어 두었습니다. 이 폴더만 바꾼 push는 배포를 다시 돌리지 않습니다.

주의: 저장소는 public입니다. 사이트에는 안 보이지만 GitHub에서는 누구나 이 폴더를 읽을 수 있습니다.
그래서 이 폴더에도 공개해도 되는 내용만 적습니다. 기준은 [SOURCES.md](SOURCES.md)를 따릅니다.

## 파일 구성

| 파일 | 내용 |
| --- | --- |
| [ROADMAP.md](ROADMAP.md) | 전체 주제 tree, 진행 단계, 글 단위 TO-DO 요약 |
| [SOURCES.md](SOURCES.md) | 쓸 수 있는 출처와 쓸 수 없는 출처, 출처 기록 방법, 확인한 공식 URL 목록 |
| [ARTICLE-CHECKLIST.md](ARTICLE-CHECKLIST.md) | 글 하나를 착수부터 발행까지 진행할 때 공통으로 거치는 체크리스트 |
| [collections/](collections/) | 컬렉션별 상세 계획. 글마다 질문, 범위, 목차 초안, labs 실험 설계, 공식 출처, 확인할 사실, 작업 항목 |

## 상태 표기

ROADMAP과 컬렉션 문서의 각 글에는 아래 상태 중 하나를 적습니다.

| 상태 | 뜻 |
| --- | --- |
| `미착수` | 계획만 있음 |
| `조사` | 공식 출처 확인과 labs 설계 중 |
| `실험` | labs에서 측정 중 |
| `초안` | `src/content/docs/`에 `draft: true`로 작성 중 |
| `재검증` | 발행 전 공식 출처 기준 전수 재확인 중 |
| `발행` | `draft: true` 제거, 컬렉션 개요 갱신 완료 |
| `보류` | 착수 조건이 충족될 때까지 대기 |

## 작업 흐름

1. ROADMAP에서 다음 글을 고르고 상태를 `조사`로 바꿉니다.
2. `collections/`의 해당 항목을 보며 공식 출처를 읽고, "확인할 사실"을 하나씩 지웁니다.
3. labs 실험을 돌리고 결과를 `labs/<collection>/<slug>/`에 남깁니다.
4. `templates/use-case.md`를 복사해 초안을 씁니다.
5. [ARTICLE-CHECKLIST.md](ARTICLE-CHECKLIST.md)의 발행 전 항목을 모두 확인한 뒤 발행합니다.
6. 체크박스와 상태를 갱신하고 커밋합니다. 계획 변경도 커밋 이력으로 남깁니다.
7. ROADMAP의 "현재 상태" 표를 바꿨다면 홈의 "다음에 쓸 글" 목록(`src/site-upcoming.mjs`)도 같은 순서로 맞춥니다. 이 목록은 사이트에 그대로 보이므로 날짜나 내부 상태 이름은 넣지 않습니다.
