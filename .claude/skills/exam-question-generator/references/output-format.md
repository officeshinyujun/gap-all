# exam.json 형식

```jsonc
{
  "title": "성공적인 직업생활 15~17단원 (AI 출제 HIGH)",
  "subject": "success",            // success | kongil
  "difficulty": "HIGH",
  "unitRange": [15, 17],
  "requestedCount": 5,
  "engine": "exam-skill-engine-v4",
  "questions": [
    {
      "orderIndex": 1,
      "unitNumber": 15,
      "targetConcept": "연차 유급휴가",
      "points": 3,
      "recommendedTemplate": "TPL_SOURCE_BLOCKS",
      "questionStem": "다음 … 옳은 것만을 <보기>에서 있는 대로 고른 것은?",
      "stimulusData": {
        "blocks": [
          { "type": "text", "text": "…" },
          { "type": "table", "title": "근로 계약 내용", "headers": [["구분", "내용"]], "rows": [["…", "…"]] },
          { "type": "dialogue", "lines": [{ "speaker": "A 씨", "text": "…" }] },
          { "type": "figure", "figure_id": "F1" }  // 그림형 문항만
        ],
        "figures": {                  // 그림이 없으면 {}
          "F1": {
            "src": "data:image/svg+xml;base64,…",   // 엔진이 명세로 그린 회색조 SVG
            "alt": "막대그래프와 꺾은선 그래프를 겹친 그래프(이중 축). … 막대 ‘불량품 수’(왼쪽 축): 치수 30, 도장 10, …",
            "kind": "chart",                       // chart(그래프) | diagram(도식) | illustration(인물 그림)
            "spec": { "id": "F1", "kind": "chart", "chartType": "bar_line", "categories": ["치수", "도장"], "series": [ … ], "valueAxis": { … } }
          }
        },
        "choice_table": null          // 짝짓기형이면 { headers, rows }
      },
      "optionsList": ["① ㄱ", "② ㄷ", "③ ㄱ, ㄴ", "④ ㄴ, ㄷ", "⑤ ㄱ, ㄴ, ㄷ"],
      "comboBlock": { "title": "<보기>", "items": [{ "key": "ㄱ", "text": "…" }] },
      "correctAnswer": 4,
      "explanation": {
        "judgment": "[출제 의도] …\n[해설] …\n[오답 피하기] …\n[계산 근거] …",
        "conceptHighlightV2": {
          "stimulusClues": [{ "quote": "제시문 그대로 인용", "why": "가리키는 개념" }],
          "optionAnalysis": [{ "optionKey": "ㄱ", "verdict": "O", "reasoning": "…" }],
          "solvingFlow": [{ "step": 1, "action": "…" }],
          "takeaway": "…"
        }
      },
      "fingerprint": "…"
    }
  ],
  "answerKey": [{ "orderIndex": 1, "correctAnswer": 4 }]
}
```

- `optionAnalysis.verdict`는 진술이 옳으면 O, 옳지 않으면 X(정답 표시가 아님). 일반형은 `optionNum`(1~5), <보기>형은 `optionKey`(ㄱ~ㄹ).
- `stimulusData`는 GAP 앱 시험지·PDF 렌더러가 그대로 읽는 TPL_SOURCE_BLOCKS 형식이다.
- 그림 종류(`spec`): 그래프 `{"kind":"chart","chartType": bar|hbar|stacked_bar|stacked_hbar|line|bar_line|pie|radar|gantt|control|scatter|curve, …}`, 도식 `{"kind":"diagram","diagramType": flow|network|fishbone|tree|cycle|venn|relation|matrix|nesting, …}`, 인물 그림 `{"kind":"scene", …}`. 도식·간트·관리도 등의 `alt`에는 엔진이 계산한 사실이 `[엔진 계산]`으로 들어간다(주 공정·소요 시간, 지연 일수, 관리 이탈 점, 이용률 등).
- 그림(`figures`): `src`는 허용 목록(태그·속성 제한, 스크립트·외부 참조 금지)을 통과한 `data:image/svg+xml;base64,…`이고 앱은 이를 인라인 SVG로 그린다(웹 글꼴 적용). `alt`는 그래프의 축·단위·범주·계열별 수치, 도식의 단계·연결·라벨을 모두 적은 설명(인물 그림은 "장식용. ○○(역할) 인물 그림"), `spec`은 원본 그림 명세다. 인물 그림 다음에는 화자·발화를 담은 dialogue 블록이 온다.
- `exam.md`는 그림을 data URI 이미지로 넣고 바로 아래에 `alt` 전문을 붙인다.
