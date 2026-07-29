import { useEffect, useState } from 'react';
import { HStack } from '@/components/general/HStack';
import { VStack } from '@/components/general/VStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import s from './style.module.scss';

const HIDE_DURATION_MS = 24 * 60 * 60 * 1000;

function getStorageKey(userId: string) {
  return `gap-entrance-notice-hidden-until:${userId}`;
}

interface EntranceNoticeModalProps {
  userId: string;
}

export function EntranceNoticeModal({ userId }: EntranceNoticeModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const storageKey = getStorageKey(userId);
    const hiddenUntil = Number(localStorage.getItem(storageKey));

    if (hiddenUntil > Date.now()) {
      return;
    }

    localStorage.removeItem(storageKey);
    setIsOpen(true);
  }, [userId]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const hideForOneDay = () => {
    localStorage.setItem(getStorageKey(userId), String(Date.now() + HIDE_DURATION_MS));
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className={s.overlay}>
      <section className={s.modal} role="dialog" aria-modal="true" aria-label="공지">
        <button className={s.closeButton} type="button" onClick={() => setIsOpen(false)} aria-label="공지 닫기">
          ×
        </button>
        <VStack gap={SPACING.s24} fullWidth>
          <VStack gap={SPACING.s12} fullWidth className={s.content}>
            {/* 공지 제목과 본문은 이 영역을 직접 수정해 작성하세요. */}
            <Typo.SM as="h2" size={24} color="primary">공지</Typo.SM>
            <Typo.MD size={16} color="secondary">현재 이 앱은 베타 버전으로 운영되고 있습니다. 이용 중 오류가 발생하면 우측 하단의 물음표 버튼을 눌러 신고해 주세요.</Typo.MD>
          </VStack>
          <HStack gap={SPACING.s8} justify="end" fullWidth className={s.actions}>
            <button className={s.closeAction} type="button" onClick={() => setIsOpen(false)}>
              닫기
            </button>
            <button className={s.hideAction} type="button" onClick={hideForOneDay}>
              하루 동안 보지 않기
            </button>
          </HStack>
        </VStack>
      </section>
    </div>
  );
}
