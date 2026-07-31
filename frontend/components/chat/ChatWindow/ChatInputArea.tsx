import { useRef } from 'react';
import Typo from '@shared/ui/Typo';
import { ArrowUp, Paperclip, Type, FileQuestion, Plus, X } from 'lucide-react';
import s from './ChatInputArea.module.scss';

interface Props {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onImageSelect: (file: File) => void;
  loading: boolean;
  pendingImage: File | null;
  imageError: string;
  onClearImage: () => void;
  typewriterEnabled: boolean;
  onToggleTypewriter: () => void;
  generateMode: boolean;
  onToggleGenerateMode: () => void;
  mobileToolsOpen: boolean;
  onToggleMobileTools: () => void;
}

export function ChatInputArea({
  input,
  onInputChange,
  onSubmit,
  onImageSelect,
  loading,
  pendingImage,
  imageError,
  onClearImage,
  typewriterEnabled,
  onToggleTypewriter,
  generateMode,
  onToggleGenerateMode,
  mobileToolsOpen,
  onToggleMobileTools,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const canSend = !!input.trim() || !!pendingImage;

  return (
    <>
      {pendingImage && (
        <div className={s.imagePreviewArea}>
          <div className={s.imagePreview}>
            <img src={URL.createObjectURL(pendingImage)} alt="문제 이미지" />
            <button className={s.imageRemoveBtn} onClick={onClearImage}>
              <X size={12} />
            </button>
          </div>
          <Typo.MD size={12} color="secondary">이미지를 전송하면 문제를 분석합니다.</Typo.MD>
          {imageError && <Typo.MD size={12} color="wrong">{imageError}</Typo.MD>}
        </div>
      )}

      <div className={s.inputArea}>
        <div className={s.inputPill}>
          <div className={s.inputInner}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImageSelect(file);
                e.target.value = '';
              }}
            />

            {/* + 버튼 + 툴 팝업 */}
            <div className={s.toolGroup}>
              <div className={`${s.toolPopup} ${mobileToolsOpen ? s.toolPopupOpen : ''}`}>
                <button className={s.toolBtn} onClick={() => fileInputRef.current?.click()} disabled={loading} data-tooltip="이미지로 질문하기">
                  <Paperclip size={16} />
                </button>
                <button
                  className={`${s.toolBtn} ${typewriterEnabled ? s.toolActive : ''}`}
                  onClick={onToggleTypewriter}
                  disabled={loading}
                  data-tooltip={typewriterEnabled ? '타자기 효과 끄기' : '타자기 효과 켜기'}
                >
                  <Type size={16} />
                </button>
                <button
                  className={`${s.toolBtn} ${generateMode ? s.toolActive : ''}`}
                  onClick={onToggleGenerateMode}
                  disabled={loading}
                  data-tooltip={generateMode ? '일반 채팅 모드' : '문제 생성 모드'}
                >
                  <FileQuestion size={16} />
                </button>
              </div>
              <button
                className={`${s.plusButton} ${mobileToolsOpen ? s.plusActive : ''}`}
                onClick={onToggleMobileTools}
                disabled={loading}
              >
                <Plus size={20} />
              </button>
            </div>

            <textarea
              className={s.input}
              placeholder={
                generateMode
                  ? '만들고 싶은 문제를 설명해주세요...'
                  : '궁금한 점을 입력하세요..'
              }
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading}
            />

            <button
              className={`${s.sendButton} ${!canSend || loading ? s.disabled : ''}`}
              onClick={onSubmit}
              disabled={!canSend || loading}
            >
              <ArrowUp size={18} color="#FFFFFF" strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
