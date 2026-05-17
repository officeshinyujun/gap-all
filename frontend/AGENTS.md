<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI & Layout Guidelines for gap/frontend
When creating or modifying components and pages, you MUST strictly adhere to the following rules regarding layout components:

1. **Layouts (VStack & HStack):**
   - **ALWAYS** use the `HStack` and `VStack` components from `app/components` to structure and set up layouts. 
   - **NEVER** write custom `display: flex` using native HTML tags (`<div style={{ display: 'flex' }}>` 등) unless absolutely necessary.
   - `HStack`: 수평 정렬을 위한 컨테이너 (`flex-direction: row`).
   - `VStack`: 수직 정렬을 위한 컨테이너 (`flex-direction: column`).

2. **VStack & HStack 주요 속성 (Props):**
   - `gap` (number): 아이템 간의 간격을 픽셀 단위로 설정합니다. (e.g., `gap={16}`)
   - `justify` ("start" | "end" | "center" | "between" | "around"): 주축(main-axis) 기준 정렬.
   - `align` ("start" | "end" | "center" | "stretch"): 교차축(cross-axis) 기준 정렬.
   - `wrap` ("wrap" | "nowrap"): 줄바꿈 여부.
   - `fullWidth` (boolean): `width: 100%` 속성을 부여합니다.
   - `fullHeight` (boolean): `height: 100%` 속성을 부여합니다.
   - `as` (ElementType): 렌더링될 HTML 태그를 변경합니다. (기본값은 `"div"`)

3. **사용 예시:**
   ```tsx
   import { VStack } from '@/app/components/VStack';
   import { HStack } from '@/app/components/HStack';

   // 항상 아래와 같이 레이아웃을 구성하세요.
   <VStack gap={24} fullWidth align="center">
       <HStack justify="between" fullWidth align="center">
           <Typo.MD size={16}>Left Text</Typo.MD>
           <Typo.SM size={14}>Right Text</Typo.SM>
       </HStack>
   ```

4. **상수(Constants) 사용 규칙:**
   - 프로젝트 내의 간격(Spacing)이나 기타 공통 값들은 **반드시** `app/constants/` 폴더 내에 정의된 상수를 가져와서 사용하세요. (예: `spacing.ts`)

5. **색상(Color) 사용 규칙:**
   - 색상 관련 값은 **반드시** `app/styles/` 폴더 내에 정의된 SCSS 변수만을 사용해야 합니다. (예: `app/styles/variables.scss`)
   - 컴포넌트 내부나 constants 폴더 등에서 하드코딩된 hex(`"#FFFFFF"`) 혹은 rgb 값을 직접 사용하는 것을 엄격히 금지합니다.
