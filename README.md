# Engineering Notes

비즈니스 문제에서 출발해 기술을 프로덕션에 적용하는 방법과, 설계하고 구현하고 운영하는 과정에서 필요한 판단 기준을 정리하는 사이트입니다.

- 사이트: https://munsik.github.io/engineering-notes/
- 원칙: [이 사이트의 원칙](src/content/docs/about/principles.md)

## 구조

```
src/content/docs/        사이트 본문 (Markdown/MDX)
  ml/anomaly-detection/  첫 번째 컬렉션
  about/                 소개, 원칙
labs/                    글에 쓴 실험 코드와 설정 (synthetic data, job 설정)
templates/               새 글 작성용 템플릿
```

## 글 쓰기

1. `templates/use-case.md`를 복사해 해당 컬렉션 폴더에 둡니다. 템플릿의 섹션은 필수 목차가 아니므로, 주제에 필요 없는 섹션은 지웁니다. 글이 무엇을 담는지는 [이 사이트의 원칙](src/content/docs/about/principles.md)을 따릅니다.
2. 작성 중에는 frontmatter에 `draft: true`를 둡니다. draft 글은 배포 빌드에서 빠집니다.
3. 공개할 때 `draft: true`를 지우고 컬렉션 개요(`index.md`)의 상태를 바꿉니다.
4. 흐름도는 ` ```mermaid ` 코드 블록으로 씁니다. [astro-mermaid](https://github.com/joesaby/astro-mermaid)가 브라우저에서 다이어그램으로 그리고, 라이트/다크 테마를 따라갑니다.

## 로컬 실행

Node.js 22.23.4 이상이 필요합니다.

```bash
npm install
npm run dev      # http://localhost:4321/engineering-notes/
npm run build    # dist/ 생성
```

`main`에 push하면 GitHub Actions가 빌드해 GitHub Pages에 배포합니다.

## License

- 글(`src/content/`): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- 코드(`labs/`, 사이트 설정): MIT
