# 0. 사이트 구조와 공통 규칙

새 컬렉션을 넣기 전에 정해 둘 것들입니다. 한 번 정하면 URL과 폴더를 다시 옮기기 어렵기 때문에 가장 먼저 처리합니다.

## 0-1. 최상위 sidebar 재구성과 URL 정책

상태: `결정` (2026-11-25)

결정한 것: 기존 AD 컬렉션 URL(`/ml/anomaly-detection/...`)은 그대로 둔다(A안). 새 컬렉션은 문제 축 폴더에 둔다. 첫 컬렉션은 `data/`(sidebar "데이터 설계")다.

sidebar와 홈의 공통 규칙(2026-11-25):

- sidebar 최상위는 컬렉션이다. 모든 컬렉션이 같은 깊이에 있다. "Machine Learning" 같은 중간 단계는 두지 않는다. 문제 축 이름은 sidebar 그룹이 아니라 홈 카드의 작은 badge로 보여 준다. 그래서 "Machine Learning" label을 "탐지와 알림"으로 바꿀지는 더 고민하지 않는다.
- 모든 컬렉션 그룹은 접힌 상태로 시작하고, 지금 읽는 글이 있는 컬렉션만 펼쳐진다. 어느 글에 있든 다른 컬렉션 이름이 화면 위쪽에 같이 보인다. About은 항상 맨 아래다.
- 공개할 컬렉션 목록은 `src/site-collections.mjs` 한 곳에서 관리한다(2026-11-28부터 `src/site-areas.mjs`, 0-6 참고). sidebar와 홈 카드가 모두 이 목록을 따른다. 순서는 ROADMAP의 문제 축 순서다.
- 컬렉션 이름과 설명은 각 컬렉션 `index.md`의 `title`, `description`을 그대로 쓴다. 홈 카드의 글 수는 build할 때 세고, draft는 세지 않는다.
- 새 컬렉션을 공개할 때는 `index.md`를 발행하고 `src/site-collections.mjs`(지금은 `src/site-areas.mjs`의 해당 영역)에 한 줄을 추가한다. `astro.config.mjs`와 홈 `index.mdx`는 고치지 않는다. `index.md`가 draft면 production build에서 sidebar와 홈 카드에서 자동으로 빠진다.
- 홈의 "다음에 쓸 글"은 `src/site-upcoming.mjs` 목록을 `UpcomingTopics` 컴포넌트가 그린다(2026-11-27). 글을 발행하거나 계획 순서가 바뀌면 이 목록만 고친다. 기존 컬렉션에 더하는 글은 그 컬렉션 개요로 링크한다.
- 홈 hero 버튼은 특정 컬렉션이 아니라 "컬렉션 보기"(홈의 컬렉션 목록으로 이동)로 둔다. 컬렉션이 늘어도 hero는 고치지 않는다.

남은 것: 나머지 문제 축 컬렉션은 첫 글을 공개할 때 위 규칙대로 추가한다.

현재 sidebar의 최상위 그룹은 `Machine Learning`이라는 제품 분류입니다. 이 사이트의 원칙은 "제품 기능별이 아니라 풀어야 할 문제별"이므로, 최상위 그룹을 문제 축으로 바꾸는 것을 검토합니다.

결정할 것:

- 최상위 그룹 이름 6개. 후보:
  - 데이터 설계 / 수집 / 안정성 운영 / 변경 관리 / 탐지와 알림 / 검색
- 폴더 이름(URL에 들어감). 후보:
  - `data/`, `ingest/`, `operations/`, `change/`, `detection/`, `search/`
- 기존 AD 컬렉션 URL(`/ml/anomaly-detection/...`) 처리 방법:
  - A안: 폴더는 그대로 두고 sidebar에서 그룹 label만 "탐지와 알림"으로 바꾼다. URL이 바뀌지 않으므로 외부 링크가 깨지지 않는다.
  - B안: `detection/anomaly-detection/`로 옮기고 Astro `redirects` 설정으로 기존 URL을 넘겨준다. 구조는 깔끔하지만 redirect를 계속 관리해야 한다.
  - 판단 기준: 이미 외부에 공유한 링크가 있는지, redirect가 GitHub Pages(정적 호스팅)에서 어떻게 동작하는지 확인한 뒤 고른다.

작업:

- [ ] 외부에 공유된 기존 AD 글 링크가 있는지 확인
- [ ] Astro `redirects`가 정적 빌드에서 만드는 결과물(meta refresh 페이지)을 로컬 빌드로 확인
- [x] A안 또는 B안 결정, 결정 이유를 이 문서에 기록 (A안. URL을 바꾸지 않고 sidebar 깊이만 맞춘다)
- [x] `astro.config.mjs`의 `sidebar` 수정. 컬렉션 목록은 `src/site-collections.mjs`에서 읽는다
- [x] 홈(`src/content/docs/index.mdx`)의 컬렉션 안내를 `CollectionCards` 컴포넌트로 바꿔 목록에서 자동 생성

## 0-6. 영역 단계 도입

상태: `결정` (2026-11-28). 0-1의 sidebar 규칙 중 "최상위는 컬렉션, 중간 단계는 두지 않는다"를 대체합니다.

배경: 사이트 이름과 sidebar 어디에도 Elastic이 나오지 않아, 검색으로 들어온 사람은 무슨 제품 이야기인지 알기 어려웠습니다. 앞으로 Elastic 밖의 주제도 쓸 계획이라, 서로 다른 기술의 컬렉션이 한 sidebar에 섞이지 않는 구조가 필요했습니다.

결정한 것:

- 구조는 영역 > 컬렉션 > 글 세 단계로 고정합니다. 영역은 기술의 경계이고, 컬렉션은 그 안에서 업무 문제 하나를 다룹니다. 컬렉션 안에 하위 그룹은 두지 않습니다.
- 첫 영역 이름은 "Elastic Stack"입니다. Elasticsearch 밖의 Kibana, Agent, Fleet, Logstash도 다루기 때문입니다. 개요 페이지는 `/elastic/`입니다.
- 화면에는 한 번에 한 영역만 보입니다. sidebar 맨 위에 영역 목록(영역들, 그리고 About)이 있고, 그 아래에는 지금 영역의 개요 링크와 컬렉션 그룹만 나옵니다. 영역이 늘어도 sidebar는 한 영역의 컬렉션 수만큼만 길어집니다.
- 글 제목 위에 "영역 › 컬렉션" 위치를 표시합니다. 컬렉션 개요의 `<title>`은 "컬렉션 | 영역"입니다. JSON-LD BreadcrumbList, llms.txt, RSS category에도 영역이 들어갑니다.
- 기존 Elastic Stack 컬렉션의 URL은 바꾸지 않습니다. 영역 소속은 설정에서만 정합니다. 새 영역의 컬렉션은 처음부터 `/<영역>/<컬렉션>/` 아래에 둡니다.
- 목록은 `src/site-areas.mjs` 한 곳에서 관리합니다(`src/site-collections.mjs`를 대체). 영역이나 컬렉션을 추가할 때 다른 파일은 고치지 않습니다.
- 다음 영역은 정하지 않았습니다. `site-areas.mjs`에 주석으로 자리만 두고, 빈 "준비 중" 영역은 공개하지 않습니다. 고객에게 링크로 전달되는 사이트라 비어 있는 영역이 미완성으로 보이기 때문입니다.

구현에서 고른 것:

- 외부 plugin(starlight-sidebar-topics)을 검토했지만, 의존성을 늘리지 않고 Starlight 기본 기능으로 만들었습니다. route middleware에서 지금 영역의 sidebar 그룹만 남기고(`src/route-middleware.ts`), Sidebar와 PageTitle 컴포넌트를 override합니다(`src/components/Sidebar.astro`, `PageTitle.astro`).
- 영역 목록이 6개를 넘으면 목록을 dropdown으로 바꾸는 것을 검토합니다.
- 시험용 영역 하나를 임시로 넣어 빌드해서, 영역 목록, sidebar 교체, 위치 표시, 홈, llms.txt가 영역마다 따로 동작하는 것과 draft 영역이 빠지는 것을 확인했습니다.

## 0-2. 컬렉션 개요(`index.md`) 뼈대

상태: `미착수`

- [ ] 컬렉션마다 `index.md`를 `draft: true`로 만든다. AD 컬렉션 `index.md`와 같은 구성(소개, 기준, 구성 표, 자주 받는 질문, 읽는 순서)을 따른다
- [ ] 구성 표의 각 행은 "예정"으로 두고, 글이 발행될 때 링크로 바꾼다
- [ ] 단계 1을 시작할 때 "데이터 설계" 컬렉션 개요부터 채운다

## 0-3. labs 디렉터리 규칙과 공통 환경

상태: `미착수`

- [ ] 폴더 규칙 확정: `labs/<collection>/<slug>/` 아래에 `README.md`, 데이터 생성 스크립트, 설정, 결과 요약
- [ ] 공통 실험 환경 `labs/_env/`: Elasticsearch, Kibana를 docker compose로 띄우는 파일. 버전은 `.env`로 바꿀 수 있게 하고 기본값은 글 기준 버전으로 둔다
- [ ] snapshot repository 실험용 S3 호환 저장소(MinIO 등) 서비스를 compose에 선택적으로 추가
- [ ] 공통 synthetic 로그 생성기 `labs/_datagen/`: host 수, 필드 수, message 길이, 배열과 객체 비율, 시간 범위를 파라미터로 받는다. 단계 1~3이 같이 쓴다
- [ ] 측정 스크립트 공통 규칙: 결과를 CSV나 JSON으로 남기고, 실행 환경(CPU, 메모리, 디스크, 버전)을 함께 기록
- [ ] 라이선스가 필요한 기능 실험은 trial 라이선스 사용 여부와 기간을 README에 적는다

## 0-4. 템플릿과 원칙 문서 보강

상태: `미착수`

- [ ] `templates/use-case.md`의 `참고 문서` 절에 출처 등급(A 공식 문서, B Labs, C 공개 소스, D labs 실측)을 주석으로 안내
- [ ] 템플릿 `기준과 전제`에 "배포 형태" 항목 추가
- [ ] About의 "개인의 경험과 의견에 기반" 문구가 각 컬렉션 개요에서도 한 번 보이도록 할지 결정
- [ ] `about/principles.md`에 "공개 출처만 근거로 쓴다"는 문장이 필요한지 검토 (현재는 공식 문서와 소스, 직접 실행 결과를 근거로 쓴다고 되어 있음)

## 0-5. 검색 유입과 AI agent 대응

상태: `부분 결정` (2026-11-25)

방향: Google은 생성형 AI 검색(AI Overviews, AI Mode)도 일반 Search 색인과 순위 체계 위에서 동작한다고 밝혔습니다. 그래서 따로 "AI용 최적화"를 하기보다 색인 가능성, 페이지 제목과 설명, 구조화 데이터, 원본 글의 품질을 먼저 챙깁니다. llms.txt와 Markdown 원문은 Google 순위에는 영향이 없지만, Claude, ChatGPT, Cursor 같은 agent가 사이트를 읽을 때 쓰도록 제공합니다.

근거:
- Google Search Central, [Optimizing your website for generative AI features on Google Search](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) (2026-05 공개, 2026-06 llms.txt 안내 보강)
- web.dev, [Build agent-friendly websites](https://web.dev/articles/ai-agent-site-ux)
- Chrome, [Lighthouse agentic browsing audits](https://developer.chrome.com/docs/lighthouse/agentic-browsing): llms.txt는 domain root에서만 찾습니다

구현한 것(build할 때 자동으로 만들어짐):

| 대상 | 내용 | 파일 |
| --- | --- | --- |
| 페이지 제목 | 컬렉션 글은 `글 제목 \| 컬렉션 topic`, 컬렉션 개요는 `컬렉션 \| 영역`. 홈은 사이트 범위를 붙임. 화면 H1은 그대로 | `src/route-middleware.ts`, `src/site-areas.mjs`의 `topic` |
| 구조화 데이터 | 홈 WebSite, 컬렉션 개요 CollectionPage(글 목록 포함), 글 TechArticle, About ProfilePage, 하위 페이지 BreadcrumbList | `src/route-middleware.ts` |
| 날짜 | datePublished(git에서 처음 추가된 commit), dateModified(마지막 commit). sitemap lastmod와 RSS pubDate도 같은 값 | `src/lib/git-dates.mjs` |
| 공유 미리보기 | 기본 og:image(1200x630), twitter:image | `public/og-default.png`, `src/site-seo.mjs` |
| sitemap | lastmod 포함 | `astro.config.mjs` |
| RSS | `/rss.xml`, head에 자동 발견 링크 | `src/pages/rss.xml.js` |
| AI agent | `/llms.txt`(컬렉션별 글 목록), `/llms-full.txt`, 컬렉션별 `/<컬렉션>/llms-full.txt`, 글마다 `.md` 원문, HTML head의 `rel="alternate" type="text/markdown"` | `src/lib/agent-markdown.mjs`, `src/pages/` |
| 소유권 확인 | Google, 네이버, Bing의 HTML 태그 값을 넣는 자리. 빈 값이면 태그를 만들지 않음 | `src/site-seo.mjs` |

새 컬렉션을 공개할 때: `src/site-areas.mjs`의 해당 영역에 `{ dir, axis, topic }` 한 줄을 넣으면 sidebar, 홈 카드, 페이지 제목, llms.txt, RSS가 함께 바뀝니다.

글을 쓸 때 지킬 것:
- `description`은 이 글이 답하는 질문과 범위를 한 문장으로 씁니다. 검색 결과 설명과 llms.txt 목록에 그대로 나갑니다.
- 제목은 짧게 두어도 됩니다. 검색 결과 제목에는 컬렉션 topic이 자동으로 붙습니다.
- 글 첫 문단에서 문제와 결론을 먼저 말합니다. 사람에게도, 글을 잘라 읽는 AI 검색에도 같은 이유로 유리합니다.

사용자가 할 일:
- [x] Google Search Console에 URL 접두어 속성 `https://munsik.github.io/engineering-notes/` 등록, HTML 태그 값을 `src/site-seo.mjs`의 `google`에 넣고 배포, 확인 후 `sitemap-index.xml` 제출 (2026-11-25. 홈과 컬렉션 개요 2개 색인 요청)
- [x] Search Console에서 생성형 AI 기능 포함 설정이 켜져 있는지 확인 (포함, munsik.github.io에서 상속)
- [ ] 네이버 서치어드바이저: `보류` (2026-11-25). 네이버는 호스트 단위(`https://munsik.github.io`)로만 등록되고, 소유확인도 최상위 페이지에서 합니다. 이 저장소로는 최상위 페이지를 만들 수 없어 보류했습니다. 하려면 `Munsik/munsik.github.io` 저장소에 확인 meta가 든 index.html, robots.txt(Sitemap 줄), llms.txt를 두거나, 개인 도메인을 쓸 때 함께 정리합니다 (github.io 하위 경로 사이트 등록 가능 여부는 등록 화면에서 확인 필요)
- [x] Bing Webmaster Tools에서 Search Console 가져오기로 등록 (2026-11-25. sitemap 2개 Success, 16개 URL 제출)
- [ ] Search Console sitemap 상태가 "가져올 수 없음"에서 바뀌었는지 며칠 뒤 확인 (Bing은 같은 sitemap을 정상으로 읽음)
- [ ] 배포 후 Rich Results Test로 글 한 개와 컬렉션 개요 한 개의 구조화 데이터 확인

남은 결정:
- root 파일: GitHub Pages 프로젝트 사이트라 `munsik.github.io/robots.txt`, `munsik.github.io/llms.txt`를 이 저장소에서 만들 수 없습니다. 지금 root에는 robots.txt가 없어(404) 모든 crawler가 허용된 상태입니다. root에 llms.txt를 두려면 `Munsik/munsik.github.io` 저장소를 만들어 root `llms.txt`와 `robots.txt`(Sitemap 줄 포함)를 두면 됩니다. 이 저장소를 만들면 `munsik.github.io/`에 페이지가 생기므로 `/engineering-notes/`로 넘기는 index.html도 같이 둡니다. 커스텀 도메인을 쓰기로 하면 이 문제는 함께 정리됩니다.
- 영문판: 지금은 locale을 추가하지 않습니다. Starlight는 번역이 없는 페이지를 기본 언어 내용으로 채워 `/en/` 아래에 만들기 때문에, 영문 글이 없을 때 locale부터 넣으면 한국어 내용이 영어 주소로 하나 더 생깁니다. 첫 영문 글을 낼 때 `en` locale을 추가하고, 그 시점에 fallback 페이지 처리와 hreflang을 같이 확인합니다. 영문으로 먼저 옮길 후보는 Segment의 생애, Merge와 force merge, 09 제조 AIOps입니다(해석: 영어권 검색 수요가 있고 실측과 소스 근거가 차별점).
- 글별 공유 이미지: 지금은 모든 페이지가 같은 og:image를 씁니다. LinkedIn 공유가 많아지면 글 제목이 들어간 이미지를 build할 때 만드는 방식을 검토합니다.
