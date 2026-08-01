import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorReport } from './index';

const fetchMock = vi.fn();

function renderErrorReport(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ErrorReport />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('ErrorReport', () => {
  it('고정 버튼으로 신고 모달을 연다', async () => {
    const user = userEvent.setup();
    renderErrorReport();

    await user.click(screen.getByRole('button', { name: '오류 신고 열기' }));

    expect(screen.getByRole('dialog', { name: '오류 신고' })).toBeInTheDocument();
  });

  it('오류 내용과 페이지 정보를 API에 전송한다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: true });
    renderErrorReport();

    await user.click(screen.getByRole('button', { name: '오류 신고 열기' }));
    await user.type(screen.getByLabelText('오류 내용'), '시험 제출 시 오류가 발생합니다.');
    await user.click(screen.getByRole('button', { name: '신고 보내기' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/reports/error'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(
      expect.objectContaining({
        message: '시험 제출 시 오류가 발생합니다.',
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
      }),
    );
    expect(screen.getByText('오류 신고가 전송되었습니다. 감사합니다.')).toBeInTheDocument();
  });

  it('랜딩 페이지에서는 렌더링하지 않는다', () => {
    const { container } = renderErrorReport('/landing');

    expect(container).toBeEmptyDOMElement();
  });
});
