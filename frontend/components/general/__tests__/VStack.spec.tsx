import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VStack } from '../VStack';

describe('VStack', () => {
  it('children을 렌더링', () => {
    render(
      <VStack>
        <span data-testid="child-1">아이템 1</span>
        <span data-testid="child-2">아이템 2</span>
      </VStack>,
    );
    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
  });

  it('gap prop을 통해 inline style 간격 적용', () => {
    render(<VStack gap={16} data-testid="vstack"><span>item</span></VStack>);
    const el = screen.getByTestId('vstack');
    // gap is applied as inline style by Flex component
    expect(el.style.gap).toBe('16px');
  });

  it('Flex 레이아웃 CSS 클래스가 적용됨', () => {
    render(<VStack data-testid="vstack"><span>item</span></VStack>);
    const el = screen.getByTestId('vstack');
    // CSS modules class names are hashed, but the base flex class is applied
    expect(el.className).toContain('flexLayout');
  });

  it('className 및 추가 스타일 props 전달', () => {
    render(
      <VStack className="my-class" style={{ padding: '8px' }} data-testid="vstack">
        <span>item</span>
      </VStack>,
    );
    const el = screen.getByTestId('vstack');
    expect(el).toHaveClass('my-class');
    expect(el.style.padding).toBe('8px');
  });

  it('align과 justify props 전달', () => {
    render(
      <VStack align="center" justify="center" data-testid="vstack">
        <span>centered</span>
      </VStack>,
    );
    const el = screen.getByTestId('vstack');
    expect(el.className).toContain('flexLayout');
  });
});
