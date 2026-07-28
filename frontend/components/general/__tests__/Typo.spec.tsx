import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Typo, { TH, MD, SM, BD } from '../Typo';

describe('Typo', () => {
  describe('TH (Thin/Light)', () => {
    it('기본 렌더링', () => {
      render(<TH>얇은 텍스트</TH>);
      expect(screen.getByText('얇은 텍스트')).toBeInTheDocument();
    });

    it('size prop 적용', () => {
      render(<TH size={24}>큰 텍스트</TH>);
      const el = screen.getByText('큰 텍스트');
      expect(el.style.fontSize).toBe('24px');
    });

    it('predefined color prop으로 CSS 클래스 적용', () => {
      render(<TH color="primary">파란 텍스트</TH>);
      const el = screen.getByText('파란 텍스트');
      // Predefined colors add a CSS class, not inline style
      expect(el.className).toContain('primary');
    });

    it('as prop으로 HTML 태그 변경', () => {
      render(<TH as="span">span 텍스트</TH>);
      const el = screen.getByText('span 텍스트');
      expect(el.tagName).toBe('SPAN');
    });
  });

  describe('MD (Medium)', () => {
    it('기본 사이즈 14px', () => {
      render(<MD>중간 텍스트</MD>);
      const el = screen.getByText('중간 텍스트');
      expect(el.style.fontSize).toBe('14px');
    });
  });

  describe('SM (Semi-bold)', () => {
    it('렌더링 및 className 적용', () => {
      render(<SM>세미볼드</SM>);
      expect(screen.getByText('세미볼드')).toBeInTheDocument();
    });
  });

  describe('BD (Bold)', () => {
    it('Predefined Size variants', () => {
      render(<BD.Size20>볼드 20</BD.Size20>);
      const el = screen.getByText('볼드 20');
      expect(el).toBeInTheDocument();
      expect(el.style.fontSize).toBe('20px');
    });

    it('className 커스텀', () => {
      render(<BD className="custom-class">커스텀 클래스</BD>);
      expect(screen.getByText('커스텀 클래스')).toHaveClass('custom-class');
    });
  });

  describe('Typo aggregate export', () => {
    it('Typo.TH, Typo.MD 등으로 접근 가능', () => {
      expect(Typo.TH).toBe(TH);
      expect(Typo.MD).toBe(MD);
      expect(Typo.SM).toBe(SM);
      expect(Typo.BD).toBe(BD);
    });
  });
});
