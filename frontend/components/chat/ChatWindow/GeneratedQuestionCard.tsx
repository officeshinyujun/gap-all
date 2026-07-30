import { API_BASE_URL } from '@shared/lib/auth';
import { QuestionRenderer } from '@shared/ui/QuestionStem/QuestionRenderer';
import type { ExamQuestion } from '@shared/types/examQuestion';
import s from './GeneratedQuestionCard.module.scss';

interface Props {
  question: ExamQuestion;
  messageId: string;
  selectedAnswer: number | undefined;
  showExplanation: boolean;
  onSelectAnswer: (optionNumber: number) => void;
}

export function GeneratedQuestionCard({
  question,
  messageId,
  selectedAnswer,
  showExplanation,
  onSelectAnswer,
}: Props) {
  const correct = question.correct_answer;
  const isCorrect = selectedAnswer ? selectedAnswer === correct : undefined;

  const handleSelect = (optionNumber: number) => {
    if (selectedAnswer) return;
    onSelectAnswer(optionNumber);
  };

  return (
    <div className={s.card}>
      <QuestionRenderer
        question={question}
        questionNumber={1}
        flat
        selectedOption={selectedAnswer}
        correctAnswer={showExplanation ? correct : undefined}
        onSelect={handleSelect}
      />
      {selectedAnswer && (
        <div className={s.feedback}>
          <div className={isCorrect ? s.correct : s.wrong}>
            {isCorrect ? '✅ 정답이야! 잘 풀었어.' : `❌ 오답이야. 정답은 ${correct}번이야.`}
          </div>
          {showExplanation && question.render_ready.explanation && (
            <div className={s.explanation}>
              {typeof question.render_ready.explanation === 'string'
                ? question.render_ready.explanation
                : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function saveAnswerToServer(messageId: string, answer: number) {
  fetch(`${API_BASE_URL}/chat/messages/${messageId}/answer`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  }).catch(() => {});
}
