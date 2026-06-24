import React from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import { InstructorBubble } from './InstructorBubble';
import { SceneCanvas } from './SceneCanvas';
import { StudentBubble } from './StudentBubble';
import type { TPL_INSTRUCTIONAL_SCENE } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLInstructionalSceneProps {
  data: TPL_INSTRUCTIONAL_SCENE;
  /** 지시문 텍스트. 기본값: "다음은 수업 장면의 일부이다. 물음에 답하시오." */
  label?: string;
}

/**
 * TPL_INSTRUCTIONAL_SCENE
 * 수업 장면 형식의 지문 컴포넌트.
 * 브라우저 창 타이틀바로 감싸고, 강사 말풍선 → 캔버스 → 학생 말풍선 순으로 렌더링됩니다.
 */
export const TPLInstructionalScene: React.FC<TPLInstructionalSceneProps> = ({
  data,
  label,
}) => {
  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>

        {/* 브라우저 창 래퍼 */}
        <div className={s.windowWrapper}>
          {/* 타이틀바 */}
          <div className={s.titleBar}>
            <HStack gap={0} align="center" justify="between" fullWidth>
              <span className={s.windowTitle}>온라인 수업</span>
              <HStack gap={4} align="center">
                <span className={s.winBtn}>─</span>
                <span className={s.winBtn}>□</span>
                <span className={s.winBtn}>×</span>
              </HStack>
            </HStack>
          </div>

          {/* 수업 내용 */}
          <div className={s.windowBody}>
            <VStack gap={16} fullWidth>
              <InstructorBubble id={data.instructor.id} text={data.instructor.text} />
              <SceneCanvas content={data.canvas_content} />
              <VStack gap={10} fullWidth>
                {data.students.map((student, index) => (
                  <StudentBubble
                    key={student.id}
                    id={student.id}
                    text={student.text}
                    colorIndex={index}
                  />
                ))}
              </VStack>
            </VStack>
          </div>
        </div>
      </VStack>
    </StemBox>
  );
};
