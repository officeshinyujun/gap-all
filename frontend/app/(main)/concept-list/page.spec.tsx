import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConceptListPage from './page';
import { fetchConceptBookmarks, fetchConceptByName } from '@/lib/studyQuizApi';

vi.mock('@/lib/studyQuizApi', () => ({
  fetchConceptBookmarks: vi.fn(),
  removeConceptBookmark: vi.fn(),
  fetchConceptByName: vi.fn(),
}));

vi.mock('@shared/ui/HeaderActions', () => ({
  HeaderActions: () => <div />,
}));

const mockFetchConceptBookmarks = vi.mocked(fetchConceptBookmarks);
const mockFetchConceptByName = vi.mocked(fetchConceptByName);

describe('ConceptListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchConceptBookmarks.mockResolvedValue([
      { id: 'industry-2', subjectSlug: 'industry', unitNumber: 2, conceptName: '생산 관리', description: null, createdAt: '' },
      { id: 'success-2', subjectSlug: 'success', unitNumber: 2, conceptName: '직업 윤리', description: null, createdAt: '' },
      { id: 'success-1', subjectSlug: 'success', unitNumber: 1, conceptName: '진로 설계', description: null, createdAt: '' },
    ]);
  });

  it('groups saved concepts by subject and ascending unit, then filters them by search', async () => {
    const user = userEvent.setup();
    render(<ConceptListPage />);

    expect(await screen.findByText('진로 설계')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['성직', '공일']);
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['1단원', '2단원', '2단원']);

    await user.type(screen.getByLabelText('저장한 개념 검색'), '윤리');

    expect(screen.getByText('직업 윤리')).toBeInTheDocument();
    expect(screen.queryByText('진로 설계')).not.toBeInTheDocument();
    expect(screen.queryByText('생산 관리')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: '공일' })).not.toBeInTheDocument();
  });

  it('shows the saved description when the live detail lookup has no matching card', async () => {
    const user = userEvent.setup();
    mockFetchConceptBookmarks.mockResolvedValue([
      {
        id: 'saved',
        subjectSlug: 'industry',
        unitNumber: 1,
        conceptName: '세부 개념',
        description: '저장된 개념 설명\n\n| 차원 | 중요성 |\n| --- | --- |\n| 개인 | 생계 |',
        createdAt: '',
      },
    ]);
    mockFetchConceptByName.mockResolvedValue({
      found: false,
      title: '세부 개념',
      description: '',
      bulletPoints: [],
      trapPoints: [],
      logicFlow: '',
    });

    render(<ConceptListPage />);
    await user.click(await screen.findByText('세부 개념'));

    expect(await screen.findByText('저장된 개념 설명')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '생계' })).toBeInTheDocument();
    expect(screen.queryByText('상세 설명을 찾을 수 없습니다.')).not.toBeInTheDocument();
  });
});
