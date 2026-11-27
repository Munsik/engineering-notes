# Mapping과 필드 수 실측

[06. Mapping과 필드 수](https://munsik.github.io/engineering-notes/data/06-mappings-and-fields/)의 실험 코드입니다.

```bash
python3 run.py --exp A   # 필드 수에 따른 mapping 크기, heap 추정치, 첫 문서 적재 시간
python3 run.py --exp B   # 필드 한도를 넘는 문서: standard, logsdb, failure store
python3 run.py --exp C   # UUID가 든 필드 이름: object 대 flattened
python3 run.py --exp D   # ECS식 문서: 기본 대 subobjects: false 의 mapper 수
```

- 환경: 로컬 Elasticsearch 9.5.5 단일 노드(vCPU 1, heap 1GB), basic 라이선스, 보안 끔. `ES` 환경변수로 주소를 바꿉니다.
- 결과: `results/exp_*.json`
