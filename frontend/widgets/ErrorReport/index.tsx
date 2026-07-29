import { useEffect, useState } from 'react';
import { CircleHelp, X } from 'lucide-react';
import { HStack } from '@/components/general/HStack';
import { VStack } from '@/components/general/VStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { API_BASE_URL } from '@shared/lib/auth';
import s from './style.module.scss';

export function ErrorReport() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const close = () => {
    setIsOpen(false);
    setMessage('');
    setError('');
    setIsSubmitted(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/reports/error`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });

      if (!response.ok) throw new Error();

      setIsSubmitted(true);
      setMessage('');
    } catch {
      setError('신고를 전송하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button className={s.trigger} type="button" onClick={() => setIsOpen(true)} aria-label="오류 신고 열기">
        <CircleHelp size={24} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className={s.overlay} onClick={close}>
          <section className={s.modal} role="dialog" aria-modal="true" aria-labelledby="error-report-title" onClick={(event) => event.stopPropagation()}>
            <VStack gap={SPACING.s24} fullWidth>
              <HStack justify="between" align="start" fullWidth>
                <VStack gap={SPACING.s6}>
                  <Typo.SM as="h2" id="error-report-title" size={20} color="primary">오류 신고</Typo.SM>
                  <Typo.MD size={14} color="secondary">발생한 문제를 적어주시면 확인 후 개선하겠습니다.</Typo.MD>
                </VStack>
                <button className={s.closeButton} type="button" onClick={close} aria-label="오류 신고 닫기">
                  <X size={20} aria-hidden="true" />
                </button>
              </HStack>

              {isSubmitted ? (
                <VStack gap={SPACING.s16} fullWidth>
                  <Typo.MD size={14} color="correct">오류 신고가 전송되었습니다. 감사합니다.</Typo.MD>
                  <HStack justify="end" fullWidth>
                    <button className={s.primaryButton} type="button" onClick={close}>닫기</button>
                  </HStack>
                </VStack>
              ) : (
                <form className={s.form} onSubmit={submit}>
                  <VStack gap={SPACING.s16} fullWidth>
                    <VStack gap={SPACING.s8} fullWidth>
                      <label className={s.label} htmlFor="error-report-message">오류 내용</label>
                      <textarea
                        id="error-report-message"
                        className={s.textarea}
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="어떤 화면에서 어떤 문제가 발생했는지 작성해 주세요."
                        maxLength={4000}
                        required
                      />
                      <Typo.MD size={12} color="secondary">현재 페이지와 브라우저 정보가 함께 전송됩니다.</Typo.MD>
                    </VStack>
                    {error && <Typo.MD size={12} color="wrong">{error}</Typo.MD>}
                    <HStack gap={SPACING.s8} justify="end" fullWidth>
                      <button className={s.secondaryButton} type="button" onClick={close} disabled={isSubmitting}>취소</button>
                      <button className={s.primaryButton} type="submit" disabled={isSubmitting || !message.trim()}>
                        {isSubmitting ? '전송 중...' : '신고 보내기'}
                      </button>
                    </HStack>
                  </VStack>
                </form>
              )}
            </VStack>
          </section>
        </div>
      )}
    </>
  );
}
