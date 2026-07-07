import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

const CIRCLED_NUMBERS = ['1', '2', '3', '4', '5'];

export interface SelectionChipProps {
  /** 1~5 사이의 선택지 번호 */
  number: 1 | 2 | 3 | 4 | 5;
  /** 선택된 상태 여부 */
  selected?: boolean;
  /** 정답 여부 (채점 후 표시용) */
  correct?: boolean;
  /** 오답 여부 (채점 후 표시용) */
  wrong?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * SelectionChip
 * 수능 선택지 번호 칩 (①②③④⑤).
 * selected, correct, wrong 상태에 따라 스타일이 변경됩니다.
 */
export const SelectionChip: React.FC<SelectionChipProps> = ({
  number,
  selected = false,
  correct = false,
  wrong = false,
  onClick,
  className,
}) => {
  return (
    <span
      className={cs(
        s.chip,
        selected && s.selected,
        correct && s.correct,
        wrong && s.wrong,
        onClick && s.clickable,
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {CIRCLED_NUMBERS[number - 1] ?? '?'}
    </span>
  );
};
