'use client';

import { useState, useEffect } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { API_BASE_URL } from '@/lib/auth';
import { ChevronDown } from 'lucide-react';
import s from './page.module.scss';

const SUBJECTS = [
  { value: 'success', label: '성공적인 직업생활' },
  { value: 'industry', label: '공업 일반' },
];

interface CardContent {
  title: string;
  description: string;
  integrated_data: {
    table: string;
    visual_analysis: string;
    logic_flow: string;
  };
  bullet_points: string[];
  trap_points: string[];
  tags: string[];
}

interface SummationCard {
  id: string;
  type: string;
  content: CardContent;
  interaction: string;
}

async function apiFetch<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? `오류: ${res.status}`);
  }
  return res.json();
}

function ListEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  return (
    <div className={s.listEditor}>
      {items.map((item, idx) => (
        <div key={idx} className={s.listItem}>
          <input
            className={s.listItemInput}
            value={item}
            onChange={(e) => {
              const next = [...items];
              next[idx] = e.target.value;
              onChange(next);
            }}
          />
          <button
            type="button"
            className={s.listRemoveBtn}
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className={s.listAddBtn}
        onClick={() => onChange([...items, ''])}
      >
        + 추가
      </button>
    </div>
  );
}

function CardEditor({ card, onChange }: { card: SummationCard; onChange: (card: SummationCard) => void }) {
  const [open, setOpen] = useState(false);

  const updateContent = (patch: Partial<CardContent>) => {
    onChange({ ...card, content: { ...card.content, ...patch } });
  };

  const updateIntegratedData = (patch: Partial<CardContent['integrated_data']>) => {
    onChange({
      ...card,
      content: {
        ...card.content,
        integrated_data: { ...card.content.integrated_data, ...patch },
      },
    });
  };

  return (
    <div className={s.card}>
      <div className={s.cardHeader} onClick={() => setOpen(!open)}>
        <div className={s.cardHeaderLeft}>
          <span className={s.cardBadge}>{card.type}</span>
          <Typo.MD size={14} color="primary">{card.content.title || card.id}</Typo.MD>
        </div>
        <ChevronDown size={16} className={`${s.chevron} ${open ? s.chevronOpen : ''}`} />
      </div>

      {open && (
        <div className={s.cardBody}>
          <div className={s.field}>
            <Typo.MD size={10} color="secondary">ID: {card.id}</Typo.MD>
          </div>

          <div className={s.field}>
            <label className={s.fieldLabel}>Title</label>
            <input
              className={s.input}
              value={card.content.title}
              onChange={(e) => updateContent({ title: e.target.value })}
            />
          </div>

          <div className={s.field}>
            <label className={s.fieldLabel}>Description</label>
            <textarea
              className={s.textarea}
              value={card.content.description}
              onChange={(e) => updateContent({ description: e.target.value })}
            />
          </div>

          <div className={s.field}>
            <label className={s.fieldLabel}>Table</label>
            <textarea
              className={s.textarea}
              value={card.content.integrated_data?.table ?? ''}
              onChange={(e) => updateIntegratedData({ table: e.target.value })}
            />
          </div>

          <div className={s.field}>
            <label className={s.fieldLabel}>Logic Flow</label>
            <textarea
              className={s.textarea}
              value={card.content.integrated_data?.logic_flow ?? ''}
              onChange={(e) => updateIntegratedData({ logic_flow: e.target.value })}
            />
          </div>

          <div className={s.field}>
            <label className={s.fieldLabel}>Visual Analysis</label>
            <textarea
              className={s.textarea}
              value={card.content.integrated_data?.visual_analysis ?? ''}
              onChange={(e) => updateIntegratedData({ visual_analysis: e.target.value })}
            />
          </div>

          <div className={s.field}>
            <label className={s.fieldLabel}>Bullet Points</label>
            <ListEditor
              items={card.content.bullet_points ?? []}
              onChange={(items) => updateContent({ bullet_points: items })}
            />
          </div>

          <div className={s.field}>
            <label className={s.fieldLabel}>Trap Points</label>
            <ListEditor
              items={card.content.trap_points ?? []}
              onChange={(items) => updateContent({ trap_points: items })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function cardMatchesSearch(card: SummationCard, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const c = card.content;
  return (
    c.title?.toLowerCase().includes(q) ||
    c.description?.toLowerCase().includes(q) ||
    c.integrated_data?.table?.toLowerCase().includes(q) ||
    c.integrated_data?.logic_flow?.toLowerCase().includes(q) ||
    c.integrated_data?.visual_analysis?.toLowerCase().includes(q) ||
    c.bullet_points?.some((bp) => bp.toLowerCase().includes(q)) ||
    c.trap_points?.some((tp) => tp.toLowerCase().includes(q)) ||
    c.tags?.some((t) => t.toLowerCase().includes(q)) ||
    false
  );
}

export default function SummationEditorPage() {
  const [subject, setSubject] = useState('success');
  const [unitNumber, setUnitNumber] = useState(1);
  const [cards, setCards] = useState<SummationCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function loadCards() {
    setLoading(true);
    setMsg(null);
    try {
      const data = await apiFetch<{ cards: SummationCard[] }>(
        `/study/${subject}/summation/${unitNumber}`,
      );
      setCards(data.cards ?? []);
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : '데이터 로드 실패' });
      setCards([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCards();
  }, [subject, unitNumber]);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch(`/study/${subject}/summation/${unitNumber}`, 'PUT', { cards });
      setMsg({ type: 'success', text: '저장 완료' });
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : '저장 실패' });
    } finally {
      setSaving(false);
    }
  }

  const updateCard = (index: number, updated: SummationCard) => {
    const next = [...cards];
    next[index] = updated;
    setCards(next);
  };

  return (
    <VStack gap={SPACING.s24} fullWidth>
      <VStack gap={SPACING.s6}>
        <Typo.BD size={24} color="primary">교재 편집</Typo.BD>
        <Typo.TH size={12} color="secondary">
          요약 카드 JSON 콘텐츠를 직접 수정합니다
        </Typo.TH>
      </VStack>

      <div className={s.controlPanel}>
        <HStack gap={SPACING.s16} align="end" wrap="wrap" fullWidth>
          <VStack gap={SPACING.s6}>
            <Typo.MD size={12} color="secondary">과목</Typo.MD>
            <select
              className={s.select}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {SUBJECTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </VStack>

          <VStack gap={SPACING.s6}>
            <Typo.MD size={12} color="secondary">단원</Typo.MD>
            <select
              className={s.select}
              value={unitNumber}
              onChange={(e) => setUnitNumber(Number(e.target.value))}
            >
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}단원</option>
              ))}
            </select>
          </VStack>

          <VStack gap={SPACING.s6}>
            <Typo.MD size={12} color="secondary">검색</Typo.MD>
            <input
              className={s.input}
              placeholder="카드 내용 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 200 }}
            />
          </VStack>

          <button
            className={`${s.button} ${s.buttonPrimary}`}
            onClick={handleSave}
            disabled={saving || loading || cards.length === 0}
          >
            {saving ? (
              <HStack gap={SPACING.s8} align="center">
                <div className={s.spinner} />
                <span>저장 중...</span>
              </HStack>
            ) : '전체 저장'}
          </button>
        </HStack>

        {msg && (
          <div className={`${s.message} ${msg.type === 'success' ? s.messageSuccess : s.messageError}`} style={{ marginTop: SPACING.s10 }}>
            {msg.text}
          </div>
        )}
      </div>

      {loading ? (
        <HStack justify="center" fullWidth>
          <div className={s.spinnerSmall} />
        </HStack>
      ) : cards.length === 0 ? (
        <Typo.MD size={14} color="secondary">카드 데이터가 없습니다</Typo.MD>
      ) : (
        <div className={s.cardList}>
          {cards.filter((card) => cardMatchesSearch(card, search)).length === 0 ? (
            <Typo.MD size={14} color="secondary">검색 결과가 없습니다</Typo.MD>
          ) : (
            cards.map((card, idx) =>
              cardMatchesSearch(card, search) ? (
                <CardEditor
                  key={card.id}
                  card={card}
                  onChange={(updated) => updateCard(idx, updated)}
                />
              ) : null,
            )
          )}
        </div>
      )}
    </VStack>
  );
}
