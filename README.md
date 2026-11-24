# Engineering Notes

엔터프라이즈 환경에서 기술을 프로덕션에 올릴 때 필요한 판단 기준과 운영 경험을 정리하는 사이트입니다.

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

1. `templates/deep-dive.md`를 복사해 해당 컬렉션 폴더에 둡니다.
2. 작성 중에는 frontmatter에 `draft: true`를 둡니다. draft 글은 배포 빌드에서 빠집니다.
3. 공개할 때 `draft: true`를 지우고 컬렉션 개요(`index.md`)의 상태를 바꿉니다.

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
