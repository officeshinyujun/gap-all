import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownWithTable } from '@/shared/ui/markdown-with-table';

describe('MarkdownWithTable', () => {
  describe('basic rendering', () => {
    it('renders null for empty string', () => {
      const { container } = render(<MarkdownWithTable>{''}</MarkdownWithTable>);
      expect(container.firstChild).toBeNull();
    });

    it('renders plain text through ReactMarkdown', () => {
      render(<MarkdownWithTable>Hello World</MarkdownWithTable>);
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('renders bold markdown', () => {
      render(<MarkdownWithTable>{'**bold text**'}</MarkdownWithTable>);
      const strong = document.querySelector('strong');
      expect(strong).toBeInTheDocument();
      expect(strong!.textContent).toBe('bold text');
    });
  });

  describe('headers', () => {
    it('renders h2 from ## header', () => {
      render(<MarkdownWithTable>{'## 개념 정의\n\n본문입니다.'}</MarkdownWithTable>);
      const h2 = document.querySelector('h2');
      expect(h2).toBeInTheDocument();
      expect(h2!.textContent).toBe('개념 정의');
      expect(screen.getByText('본문입니다.')).toBeInTheDocument();
    });
  });

  describe('lists', () => {
    it('renders unordered list from markdown', () => {
      render(<MarkdownWithTable>{'- 항목 1\n- 항목 2\n- 항목 3'}</MarkdownWithTable>);
      const lis = document.querySelectorAll('li');
      expect(lis.length).toBe(3);
    });
  });

  describe('pipe table detection — should NOT misinterpret regular text', () => {
    it('renders inline pipe in sentence as plain text', () => {
      // This is the key fix: pipe in regular text should NOT be treated as a table
      render(<MarkdownWithTable>{'옳은 것 | 틀린 것 구분하기'}</MarkdownWithTable>);
      // Should render as ReactMarkdown, not PipeTable (no <table> tag)
      const table = document.querySelector('table');
      expect(table).toBeNull();
      expect(screen.getByText(/옳은 것.*틀린 것 구분하기/)).toBeInTheDocument();
    });

    it('renders description with multiple pipes in lines as regular markdown', () => {
      const text = '이 개념은 선택지에서 "옳은 것"과 "틀린 것"을 구분하는 능력 | 즉 판단력을 측정합니다.';
      render(<MarkdownWithTable>{text}</MarkdownWithTable>);
      const table = document.querySelector('table');
      expect(table).toBeNull();
    });

    it('renders concept description with natural pipe-like content', () => {
      const text = '① 옳은 진술 | ② 틀린 진술 중에서 선택';
      render(<MarkdownWithTable>{text}</MarkdownWithTable>);
      const table = document.querySelector('table');
      expect(table).toBeNull();
    });
  });

  describe('GFM table detection — should render as table', () => {
    it('renders GFM table with header and separator as table', () => {
      const gfmTable = '| 구분 | 설명 |\n|------|------|\n| A | 첫 번째 |\n| B | 두 번째 |';
      render(<MarkdownWithTable>{gfmTable}</MarkdownWithTable>);
      const table = document.querySelector('table');
      expect(table).toBeInTheDocument();
    });

    it('renders pure pipe table (all lines are table rows) as table', () => {
      const pureTable = '이름 | 나이 | 직업\n홍길동 | 25 | 학생\n김철수 | 30 | 회사원';
      render(<MarkdownWithTable>{pureTable}</MarkdownWithTable>);
      const table = document.querySelector('table');
      expect(table).toBeInTheDocument();
    });
  });

  describe('mixed content', () => {
    it('renders markdown with header and paragraph', () => {
      render(<MarkdownWithTable>{'## 개념\n\n설명 텍스트입니다.'}</MarkdownWithTable>);
      expect(document.querySelector('h2')).toBeInTheDocument();
      expect(screen.getByText('설명 텍스트입니다.')).toBeInTheDocument();
    });

    it('renders markdown with nested formatting', () => {
      render(<MarkdownWithTable>{'**굵게** 그리고 *기울임* 그리고 `코드`'}</MarkdownWithTable>);
      expect(document.querySelector('strong')).toBeInTheDocument();
      expect(document.querySelector('em')).toBeInTheDocument();
      expect(document.querySelector('code')).toBeInTheDocument();
    });
  });
});
