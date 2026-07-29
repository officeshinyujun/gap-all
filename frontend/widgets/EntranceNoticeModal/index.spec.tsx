import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { EntranceNoticeModal } from './index';

const USER_ID = 'test-user';
const STORAGE_KEY = `gap-entrance-notice-hidden-until:${USER_ID}`;

function renderModal() {
  return render(
    <EntranceNoticeModal userId={USER_ID} />,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('EntranceNoticeModal', () => {
  it('숨김 기한이 없으면 공지를 표시한다', () => {
    renderModal();

    expect(screen.getByRole('dialog', { name: '공지' })).toBeInTheDocument();
  });

  it('하루 동안 보지 않기를 선택하면 사용자별 숨김 기한을 저장하고 닫는다', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: '하루 동안 보지 않기' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(Number(localStorage.getItem(STORAGE_KEY))).toBeGreaterThan(Date.now());
  });

  it('아직 유효한 숨김 기한이 있으면 공지를 표시하지 않는다', () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now() + 60_000));

    renderModal();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
