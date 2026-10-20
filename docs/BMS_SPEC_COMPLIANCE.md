# BMS 스펙 준수 현황

기준 문서: [BMS command memo (hitkey)](https://hitkey.nekokan.dyndns.info/cmds.htm)
조사일: 2026-10-20 · 대상: `vendor/bms-core`, `vendor/bms-player`, `vendor/bms-editor`, `src/` (앱)

상태 표기: ✅ 지원 · ⚠️ 부분 지원 · ❌ 미지원/무시 · 🐞 스펙과 다르게 동작(버그)

---

## 1. 요약 — 우선순위 버그

| # | 문제 | 위치 | 상태 |
|---|---|---|---|
| 1 | 투명 노트(31-4Z)가 일반 노트로 표시·판정됨 | `src/renderer/routes/Player.tsx` (지뢰만 필터), `bms-core/.../notes/index.ts` `_normalizeChannel` | 🐞 |
| 2 | 노트 히트 시 키음 2회 재생 (메인 스레드 캐시 + 워커 `playSound`) | `bms-player/src/game/WorkerGameLoop.ts`, `GameEngine.ts` | 🐞 |
| 3 | `#RANK`/`#DEFEXRANK`/`#TOTAL`이 엔진에 전달되지 않음 → 항상 NORMAL / TOTAL 200 | `src/renderer/routes/Player.tsx`, `useGamePlayer` | 🐞 |
| 4 | BPM 변화 시 스크롤 속도가 BPM²에 비례하는 것으로 의심 | `bms-core/.../positioning/index.ts` `_buildNormalizedSpeedcore` | 🐞(확인 필요) |
| 5 | 최상위 `#SWITCH…#SKIP…#ENDSW` 이후 내용 전부 유실 | `bms-core/.../compiler/controlFlow.ts` `endSwitch` | 🐞 |
| 6 | 파일 내 `#SETRANDOM`/`#SETSWITCH` 무시 → 모든 `#IF` 스킵 / 모든 `#CASE` 적용 | `bms-core/.../compiler/index.ts` | 🐞 |
| 7 | 중첩 `#RANDOM`/`#IF`가 부모 스킵 상태 무시, `#CASE` fallthrough 없음, `#DEF` 위치 의존, `#END IF` 미인식, 미선택 분기의 `#WAV`/`#BMP`가 덮어씀 | `controlFlow.ts`, `compiler/index.ts` | 🐞 |
| 8 | `#BPM` 미지정 기본값 불일치: 런타임 60 / UI 130 / 저장 120 (스펙 130) | `timing/index.ts`, `headerWriter.ts`, `useLocalBmsFile.ts` | 🐞 |
| 9 | 지뢰 데미지 `값/256` (스펙 `값/2` %), `ZZ` 즉사 미구현, `#WAV00` 폭발음 미재생 | `bms-core/.../notes/channels.ts`, `GaugeSystem.ts` | 🐞 |
| 10 | 10K 레인 불일치 (파서 2P = 8~12열, player/editor 레인 6~10) → 노트 소실·잘못 저장 | `styleStrategy.ts`, player/editor `laneConfig.ts` | 🐞 |
| 11 | EUC-KR 차트가 Shift_JIS로 오인될 가능성 (판별 순서) | `bms-core/.../reader/index.ts` | ⚠️(추정) |

---

## 2. 헤더 명령

| 명령 | 파서 | 플레이어 | 에디터/저장 | 테스트 |
|---|---|---|---|---|
| `#PLAYER` | raw (스타일 판별에 `3`만 사용) | — | 없으면 `#PLAYER 1` 추가 | 있음 |
| `#RANK` | raw | 🐞 엔진에 미전달 | ⚠️ UI 0~3만, 없으면 `#RANK 3` 추가, 비숫자 → `NaN` | 엔진만 |
| `#DEFEXRANK` | ⚠️ 정수만, `0` 거부, `#RANK` 폴백 없음, 모듈 미export | 🐞 미전달 | custom 헤더 | 엔진만 |
| `#EXRANKxx` + A0 | ⚠️ 미정의 ID 처리 스펙과 다름, 모듈 미export | ❌ | A0 저장 시 유실 | 없음 |
| `#TOTAL` | raw | 🐞 미전달 (항상 200) | ⚠️ 소수점 버림 | 게이지 클래스만 |
| `#VOLWAV` | raw (비표준 `#VOLWAVxx`는 지원) | ✅ | ✅ | 없음 |
| `#STAGEFILE` / `#BANNER` / `#BACKBMP` | raw | ❌ 표시 안 함 | ✅ 필드 | 헤더만 |
| `#PLAYLEVEL` | ⚠️ 문자열 → 0 | ❌ 표시 안 함 | 🐞 문자열 → `NaN`, 소수 버림 | 일부 |
| `#DIFFICULTY` | ✅ | ❌ 표시 안 함 | ✅ | 있음 |
| `#TITLE` / `#SUBTITLE` | ⚠️ 암묵 부제 일부 패턴 누락 | 제목만 | SUBTITLE 다중 → 마지막만 | 있음 |
| `#ARTIST` / `#SUBARTIST` | ✅ | ARTIST만 | SUBARTIST 다중 → 마지막만 | ARTIST만 |
| `#GENRE` / `#GENLE` | GENLE 별칭 미지원 | ✅ | ✅ | GENRE만 |
| `#MAKER` / `#COMMENT` | raw | — | COMMENT 다중 → 마지막만 | 없음 |
| `#TEXTxx` / `#SONGxx` | ⚠️ Text 모듈 미export | ❌ | 헤더만 남고 99 채널 유실 | 없음 |
| `#PATH_WAV` | raw, 경로에 미적용 | ❌ | custom | 없음 |
| `#BPM` | 🐞 기본 60 | 🐞 | 🐞 기본 120 기록 | 있음 |
| `#BASEBPM` | ⚠️ 스크롤 정규화 기준으로 사용 (스펙 의미와 다름) | 🐞 #4 참고 | custom | 없음 |
| `#BPMxx` | ✅ | ✅ | ✅ | 있음 |
| `#EXBPMxx` | ❌ 08 채널에서 조회 안 함 | ❌ | 🐞 해당 08 이벤트 유실 | 없음 |
| `#STOPxx` | ✅ 소수 OK, 음수는 되감기로 처리 | ✅ | ✅ | 소수만 |
| `#STP` | raw | ❌ | 다중 → 마지막만 (스펙은 누적) | 없음 |
| `#LNTYPE 1` | ⚠️ 값 미참조, LN 끝 키음 폐기 | ⚠️ 끝까지 홀드해도 GREAT | 🐞 끝 키음을 시작 키음으로 덮어씀 | 일부 |
| `#LNTYPE 2` | ❌ (1로 처리) | ❌ | 🐞 LN 깨짐 | 없음 |
| `#LNOBJ` | ⚠️ 1개만 | ✅ | ⚠️ 1개만 | 단일만 |
| `#LNMODE` | raw | ❌ 항상 CN | custom | 없음 |
| `#OCT/FP` | 🐞 헤더 정규식(`\w+`) 불일치로 무시 | ❌ | 유실 | 없음 |
| `#WAVxx` | ✅ (base-36/62) | ✅ 확장자 폴백 .ogg>.wav>.flac>.mp3>.m4a | ✅ | 있음 |
| `#WAV00` | — | ❌ 지뢰 폭발음 미재생 | 무음 취급 | 없음 |
| `#EXWAVxx` / `#WAVCMD` | raw / 🐞 ID "CMD"인 WAV로 오인 | ❌ | custom / 오인 | 없음 |
| `#BMPxx` / `#EXBMPxx` | raw | ❌ BGA 미구현 | ✅ / custom | 없음 |
| `#BGAxx` / `#@BGAxx` | ⚠️ 모듈 미export / 🐞 `@` 정규식 불일치로 무시 | ❌ | custom / 유실 | 없음 |
| `#POORBGA` `#SWBGAxx` `#ARGBxx` `#VIDEO*` `#MOVIE` `#CHARFILE` `#MIDIFILE` `#CDDA` `#SEEKxx` `#CHANGEOPTIONxx` `#OPTION` `#ExtChr` `#MATERIALS*` `#DIVIDEPROP` `#PREVIEW` | raw | ❌ (크래시 없음) | custom, 관련 채널(05, A1~A6) 유실 | 없음 |
| `#CHARSET` | 무시 | — | custom | 없음 |
| 주석 (`#` 아닌 줄) | ✅ / 인라인 `//` 미처리 | — | 원본 주석 미보존 | no-throw만 |

## 3. 제어 흐름

파서가 `Math.random`으로 분기를 확정하므로 **로드할 때마다 다른 분기**가 선택되고, 에디터 저장 시 선택된 분기만 평탄화되어 **나머지 분기와 `#RANDOM` 구조가 영구 유실**된다. Home/Player/Editor가 각자 파싱하므로 화면마다 다른 분기가 될 수 있다.

| 명령 | 상태 | 테스트 |
|---|---|---|
| `#RANDOM` | ⚠️ 로드 시 확정, `#random5`(공백 없음) 미인식 | 있음 |
| `#SETRANDOM` | 🐞 파일 내 사용 무시 → 모든 `#IF` 스킵 | 없음 |
| `#IF` / `#ELSEIF` / `#ELSE` | ⚠️ 동작하나 중첩 시 부모 스킵 무시 | 있음 |
| `#ENDIF` / `#END IF` | ENDIF ✅ / `#END IF` 🐞 미인식 | ENDIF만 |
| `#ENDRANDOM` | ✅ (생략 허용) | 있음 |
| 중첩 `#RANDOM` | 🐞 미선택 외부 분기의 내부 내용 유입 | no-throw만 |
| `#SWITCH` / `#CASE` | ⚠️ fallthrough 없음 | 있음 |
| `#SETSWITCH` | 🐞 무시 → 모든 `#CASE` 적용 | 없음 |
| `#SKIP` / `#ENDSW` | 🐞 최상위에서 `#ENDSW`가 스킵 해제 안 함 (테스트가 버그 동작을 고정) | 있음(잘못된 기대값) |
| `#DEF` | ⚠️ `#CASE`보다 앞에 오면 오동작, fallthrough 진입 안 됨 | 있음(잘못된 기대값) |

## 4. 채널

| 채널 | 파서 | 플레이어 | 저장 | 테스트 |
|---|---|---|---|---|
| 01 BGM (다중 행) | ✅ | ✅ | ✅ | 있음 |
| 02 마디 길이 | ✅ (≤0 → 1) | ✅ | ✅ | 있음 |
| 03 BPM (hex) | ✅ | ✅ | ✅ | 있음 |
| 04 / 06 / 07 BGA | raw | ❌ | ✅ 보존 | 없음 |
| 05, 0A, 0B~0E, 97, 98, A1~A6 | raw | ❌ | 🐞 유실 | 없음 |
| 08 exBPM / 09 STOP | ✅ (`#EXBPM` 제외) | ✅ | ✅ | 있음 |
| 99 TEXT / A0 JUDGE | ⚠️ 모듈 미export | ❌ | 🐞 유실 | no-throw만 |
| 11-19 / 21-29 | ✅ | ⚠️ 키 바인딩은 스크래치+1~7키뿐 (DP 2P, PMS 8·9키 불가) | ✅ | 있음 |
| 1A-1Z / 2A-2Z (확장) | ⚠️ 열 매핑 없음 | ❌ BGM으로 재생 | 🐞 채널 01로 저장 | 없음 |
| 17 / 27 풋 페달 | ⚠️ 많으면 키보드 모드로 오판 | ❌ 레인 없음, 항상 MISS | ✅ | 없음 |
| 31-4Z 투명 | ✅ (1x/2x로 정규화) | 🐞 일반 노트로 판정 | ✅ | 플레이어 없음 |
| 51-6Z LN | ✅ | ⚠️ | ⚠️ 끝 키음 유실 | 있음 |
| D1-D9 / E1-E9 지뢰 | 🐞 데미지 계산 | ⚠️ `ZZ` 즉사 없음, 지뢰 판정 로직 미테스트 | ✅ | 외부 파일만 |

## 5. 키 모드

| 모드 | 플레이어 | 에디터 |
|---|---|---|
| 5K / 7K | ✅ | ✅ |
| 10K | 🐞 레인 불일치 (11~12열 미표시) | 🐞 저장 시 1P 18/19로 기록 |
| 14K (DP) | ⚠️ 2P측·SC2는 오토플레이만 | ✅ |
| PMS 9K | ⚠️ 8·9키 바인딩 불가 | ✅ |
| PMS BME-type | ⚠️ 레인 순서 스펙과 다름 | ⚠️ |
| PMS 5버튼 | ⚠️ 7K로 인식 | ⚠️ |
| DSC / OCT / FP | ⚠️ DP로 처리 | ⚠️ |

## 6. 인코딩·파일

| 항목 | 상태 | 테스트 |
|---|---|---|
| Shift_JIS 읽기 | ✅ | 외부 파일 의존 |
| EUC-KR 읽기 | ⚠️ Shift_JIS 우선 판별로 오인 가능 | 없음 |
| 저장 인코딩 | ⚠️ 항상 UTF-8 (원본 인코딩 미유지) | 없음 |
| BOM / CRLF / 소문자 헤더 / 전각 공백 | ✅ (전각 `＃` 미지원) | CRLF만 |
| 비ASCII 키음 파일명 | ✅ 디렉터리 목록 기반 대소문자 무시 매칭 | 없음 |

---

## 7. 테스트 공백

### 구조적 문제
- 앱 CI(`.github/workflows/ci.yml`)는 `tests/unit`, `tests/integration`, `tests/compatibility`만 실행. vendor 패키지 테스트(판정 테이블, 게이지, DEFEXRANK, retrigger cut 등)는 각 패키지 저장소에서만 돈다.
- bms-core의 `parser` / `extreme` / `stress` / `writer` 테스트는 `INTEGRATION=1` + `S:/` 드라이브의 실제 차트가 필요 → CI에서 사실상 미실행.
- `tests/e2e/player.spec.ts`는 존재하지 않는 `C:\test\song.bms`를 열고 "Rendering Error" 부재만 확인 → 에러 화면에서도 통과.
- `compiler-controlFlow.test.ts`의 일부 케이스는 스펙과 다른 동작(`#ENDSW`, `#DEF`)을 기대값으로 고정하고 있다.

### 구현은 있으나 테스트 없음
- 엔진 LN 머리/꼬리 판정 및 자동 처리
- 엔진 지뢰 판정
- 워커 모드 키음 즉시 재생 캐시 (`WorkerGameLoop` nextNotes 캐시)
- `#VOLWAV` 마스터 볼륨, `#VOLWAVxx`, `parseVolWav`
- 음수 STOP 되감기, 런타임 소수 STOP
- `#BASEBPM` 스크롤 정규화
- 에디터 저장 후 BGA 이벤트 유지, LNOBJ 모드 저장
- `#RANDOM` 로드별 분기 선택 / 에디터 평탄화
- 클리어 판정·결과 화면, MISS 노트 키음 재생

### 스펙 항목인데 테스트 전무
`#SETRANDOM`, `#SETSWITCH`, 중첩 `#RANDOM`(no-throw만), `#END IF`, `#DEFEXRANK`, `#EXRANKxx`, `#RANK 4`, 채널 0A~0E·97/98·99·A0~A6, 확장 레인 1A~1Z, 풋 페달 17, PMS 5버튼/BME-type, `#LNTYPE 2`, 다중 `#LNOBJ`, LN 끝 키음, 음수/0 BPM, 음수 STOP, BOM, EUC-KR, 소문자 헤더, 전각 공백.

---

## 8. 수정 진행 기록

| 날짜 | 항목 | 내용 |
|---|---|---|
| 2026-10-20 | — | 문서 작성, 1차 수정 착수 (#1~#9) |
| 2026-10-20 | #1 투명 노트 | `Player.tsx` `splitPlayerNotes` — 투명 노트를 notechart에서 제외 (키음 프리로드는 `#WAV` 테이블 기준이라 영향 없음) |
| 2026-10-20 | #3 판정/게이지 | `Player.tsx` `chartJudgeOptions` — `#RANK`(0~4), `#TOTAL` 전달. `#DEFEXRANK`는 엔진에 그대로 전달 (2026-10-21 `JudgmentEngine` 식 수정 후 적용) |
| 2026-10-20 | #2 키음 2회 | keyDown 메시지에 `playedKeysound {keysound, offset}` 추가 — 워커는 판정 노트의 키음이 메인에서 이미 재생된 것과 같을 때만 생략 |
| 2026-10-20 | #8 BPM 기본값 | `DEFAULT_BPM = 130` (timing, writer) |
| 2026-10-20 | #9 지뢰 | 데미지 `base36/2`%, `ZZ` → `LANDMINE_INSTANT_GAMEOVER`(Infinity) → 모든 게이지에서 즉시 실패 |
| 2026-10-20 | #5~#7 제어 흐름 | `controlFlow.ts` 단일 프레임 스택으로 재작성: 중첩 스킵, `#SETRANDOM`/`#SETSWITCH`, fallthrough, `#DEF`(IIDXv 방식), `#END IF`/`#IFEND`/`#RONDAM`/구분자 생략, 미선택 분기 `#WAV`/`#BMP` 무시 |
| 2026-10-20 | #4 BPM² 스크롤 | 확인됨. `positioning` BPM 정규화 제거 → position = beat × SCROLL. 에디터 뷰어 그리드도 박 기준으로 바뀜 |
| 2026-10-21 | 후속 DEFEXRANK | `JudgmentEngine` — 활성 스타일 RANK 2 판정창 × `d/100` (bad 창은 유지). `Player.tsx`가 defexrank를 그대로 전달 |
| 2026-10-21 | 후속 RANK/DEFEXRANK 순서 | `BMSHeaders.order(name)` 추가 (마지막 정의의 파일 내 순서). `chartJudgeOptions`는 둘 다 유효하면 EOF에 가까운 쪽을 사용 |
| 2026-10-21 | 후속 지뢰 데미지 0 | `GameEngine` — 데미지 0은 그대로 0 (무해한 지뢰). 데미지 정보가 없는 노트차트만 5% 대체 |
| 2026-10-21 | 후속 `#TOTAL < 100` | `GameEngine` — 100 클램프 제거. 없거나 0 이하/비유한 값만 기본값 200 |
| 2026-10-21 | 후속 MISS 키음 중복 | `GameEngine` — 빈 입력(또는 다른 노트 판정)에서 메인 스레드가 미리 재생한 다음 노트를 기억해 해당 노트 MISS 시 다시 울리지 않음 |
| 2026-10-21 | 후속 `#ENDSW` 누락 | `controlFlow.endIf` — `#SWITCH` 프레임을 넘어 `#IF`를 찾아 닫음 (`#IF` 안의 닫히지 않은 `#SWITCH`도 함께 닫힘) |
| 2026-10-21 | 후속 난이도 추정 | 앱 `estimateDifficulty` — 투명 노트 제외 |
| 2026-10-21 | 후속 공개 export | bms-core에서 `DEFAULT_BPM`, `LANDMINE_INSTANT_GAMEOVER`, `calculateLandmineDamage` export. 앱 파서 경로의 `130` 하드코딩을 `DEFAULT_BPM`으로 교체 |
| 2026-10-21 | 테스트 | `keysoundPlayerAdapter.test.ts`를 `chokeGroup`/`catchUp` 옵션과 `#BASE 62` 대소문자 유지에 맞춰 갱신 |

### 1차 수정 후 후속 과제
- ✅ (2026-10-21 처리) `JudgmentEngine` DEFEXRANK 판정창을 활성 스타일의 RANK 2 판정창 × `d/100`으로 변경하고, `Player.tsx`는 defexrank를 그대로 전달. `defexrankToRank` 근사 제거.
- ✅ (2026-10-21) `#RANK`와 `#DEFEXRANK` 공존 시 "EOF에 가까운 쪽 우선" — `BMSHeaders.order()`로 구현.
- ✅ (2026-10-21) `GameEngine` 지뢰 데미지 0 → 5% 대체 제거.
- ✅ (2026-10-21) `GameEngine` `#TOTAL < 100` 클램프 제거 (작은 TOTAL도 그대로 사용).
- ✅ (2026-10-21) 선재생된 노트 키음이 MISS 처리 시 한 번 더 울리던 문제.
- ✅ (2026-10-21) `#IF` 안 `#SWITCH`에 `#ENDSW`가 없을 때 `#ENDIF`가 둘 다 닫음.
- ✅ (2026-10-21) `estimateDifficulty` 투명 노트 제외.
- ✅ (2026-10-21) `DEFAULT_BPM`, `LANDMINE_INSTANT_GAMEOVER` 공개 export.

### 남은 범위 (다음 라운드)
- #10 10K 레인 불일치, #11 EUC-KR 판별 순서, 에디터 저장 시 채널 유실(A0, 99, 08 EXBPM 등) — 1절/2~6절 표 참고.
- 1차 수정은 위 표에 기록하고, 2~6절 표는 조사 시점(2026-10-20) 스냅숏으로 유지.
