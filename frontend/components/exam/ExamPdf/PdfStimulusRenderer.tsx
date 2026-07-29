import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { styles } from './styles';
import type {
  TPL_COMPARATIVE_MATRIX,
  TPL_FORMAL_DOCUMENT,
  TPL_CONVERSATIONAL_FLOW,
  TPL_CASE_DIAGNOSTIC_FRAME,
  TPL_SEQUENTIAL_WORKFLOW,
  TPL_INSTRUCTIONAL_SCENE,
  TPL_DIGITAL_FORUM_INTERFACE,
  TPL_QUANTITATIVE_CHART,
  TPL_PROMOTIONAL_CANVAS,
  TPL_ARTICLE,
  TPL_STATISTICS,
  TPL_INCIDENT_REPORT,
  TPL_ANNOUNCEMENT,
  TPL_REPORT,
} from '@/types/questionstem';

interface Props {
  template: string | undefined;
  data: unknown;
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function renderComparativeMatrix(data: TPL_COMPARATIVE_MATRIX) {
  return safe(() => {
    const headers = data.headers ?? [];
    const rows = data.rows ?? [];
    if (headers.length === 0 || rows.length === 0) return null;
    return (
      <View style={styles.stimulusBox}>
        <View style={[styles.tableRow, { borderTopWidth: 0.5, borderTopColor: '#999', borderTopStyle: 'solid' as const }]}>
          {headers.map((h, i) => (
            <Text key={i} style={styles.tableCellHeader}>{h.label}</Text>
          ))}
        </View>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.tableRow}>
            {(row.cells ?? []).map((cell, ci) => (
              <Text key={ci} style={ci === 0 ? styles.tableCellHeader : styles.tableCell}>{cell}</Text>
            ))}
          </View>
        ))}
      </View>
    );
  }, null);
}

function renderFormalDocument(data: TPL_FORMAL_DOCUMENT) {
  return safe(() => {
    const paragraphs = data.paragraphs ?? [];
    const footnotes = data.footnotes ?? [];
    return (
      <View style={styles.stimulusBox}>
        <Text style={styles.stimulusTitle}>{data.header_info?.title ?? ''}</Text>
        {paragraphs.map((p, i) => (
          <View key={i} style={{ marginBottom: 3 }}>
            {p.sub_title ? <Text style={[styles.stimulusText, { fontWeight: 700 }]}>{p.sub_title}</Text> : null}
            <Text style={styles.stimulusText}>{p.content ?? ''}</Text>
          </View>
        ))}
        {footnotes.length > 0 && (
          <View style={{ marginTop: 4, borderTopWidth: 0.5, borderTopColor: '#ccc', borderTopStyle: 'solid' as const, paddingTop: 2 }}>
            {footnotes.map((fn, i) => (
              <Text key={i} style={[styles.stimulusText, { fontSize: 7 }]}>* {fn}</Text>
            ))}
          </View>
        )}
      </View>
    );
  }, null);
}

function renderConversationalFlow(data: TPL_CONVERSATIONAL_FLOW) {
  return safe(() => {
    const participants = data.participants ?? [];
    const messages = data.messages ?? [];
    const participantMap = new Map(participants.map((p) => [p.id, p]));
    const actionLabels = {
      request: '요청', inform: '알림', consult: '상담', approve: '승인',
      reject: '거절', provide: '제공', report: '보고', notify: '통지',
      pay: '지급', regulate: '규제',
    } as const;
    const sceneLabels = {
      dialogue: '대화 장면', interview: '인터뷰 장면', school: '학교 장면',
      office: '사무실 장면', public_service: '공공기관 장면',
      hospital: '의료기관 장면', shop: '상점 장면', court: '법원 장면',
    } as const;
    const sceneLabel = data.scene_kind && data.scene_kind !== 'none'
      ? sceneLabels[data.scene_kind]
      : undefined;
    const visualAid = data.visual_aid;
    return (
      <View style={styles.stimulusBox}>
        {sceneLabel ? <Text style={styles.stimulusTitle}>[{sceneLabel}]</Text> : null}
        {visualAid?.kind === 'actor_flow' ? (
          <View style={{ marginBottom: 3 }}>
            {visualAid.relations.map((relation, index) => {
              const from = participantMap.get(relation.from_id);
              const to = participantMap.get(relation.to_id);
              if (!from || !to) return null;
              return (
                <Text key={index} style={styles.stimulusText}>
                  [{from.name}] --{actionLabels[relation.action_key]}--&gt; [{to.name}]
                </Text>
              );
            })}
          </View>
        ) : null}
        {messages.map((msg, i) => (
          <View key={i} style={{ marginBottom: 3 }}>
            <Text style={styles.speakerName}>{participantMap.get(msg.p_id)?.name ?? msg.p_id}:</Text>
            <Text style={styles.messageText}>{msg.text ?? ''}</Text>
          </View>
        ))}
      </View>
    );
  }, null);
}

function renderCaseDiagnosticFrame(data: TPL_CASE_DIAGNOSTIC_FRAME) {
  return safe(() => {
    const profiles = Array.isArray(data.case_profile)
      ? data.case_profile
      : data.case_profile
        ? [data.case_profile]
        : [];
    const checkItems = Array.isArray(data.check_items) ? data.check_items : [];
    return (
      <View style={styles.stimulusBox}>
        {profiles.map((p, pi) => (
          <View key={pi}>
            {pi > 0 && <View style={{ height: 1, backgroundColor: '#ccc', marginVertical: 3 }} />}
            <Text style={styles.stimulusTitle}>{p.name ?? ''}</Text>
            {p.context ? <Text style={styles.stimulusText}>{p.context}</Text> : null}
          </View>
        ))}
        <Text style={[styles.stimulusText, { marginTop: 3 }]}>{data.narrative ?? ''}</Text>
        {checkItems.length > 0 && (
          <View style={{ marginTop: 4 }}>
            {checkItems.map((item, i) => (
              <Text key={i} style={styles.stimulusText}>
                {item.is_checked ? '☑' : '☐'} {item.label ?? ''}
              </Text>
            ))}
          </View>
        )}
      </View>
    );
  }, null);
}

function renderSequentialWorkflow(data: TPL_SEQUENTIAL_WORKFLOW) {
  return safe(() => {
    const steps = data.steps ?? [];
    if (steps.length === 0) return null;
    return (
      <View style={styles.stimulusBox}>
        {steps.map((step, i) => (
          <React.Fragment key={i}>
            <View style={styles.stepRow}>
              <Text style={styles.stepLabel}>{step.label?.trim() || String(step.idx)}</Text>
              <Text style={styles.stepDesc}>{step.is_missing ? '( ? )' : (step.desc ?? '')}</Text>
            </View>
            {i < steps.length - 1 && <Text style={styles.arrow}>{data.orientation === 'horizontal' ? '→' : '↓'}</Text>}
          </React.Fragment>
        ))}
      </View>
    );
  }, null);
}

function renderInstructionalScene(data: TPL_INSTRUCTIONAL_SCENE) {
  return safe(() => {
    const instructor = data.instructor;
    const students = data.students ?? [];
    let canvasText = '';
    if (data.canvas_content) {
      const { type, data: cData } = data.canvas_content;
      if (type === 'text' && typeof cData === 'string') {
        canvasText = cData;
      } else if (type === 'table' && Array.isArray(cData)) {
        canvasText = (cData as string[][]).map((row) => row.join(' | ')).join('\n');
      } else if (typeof cData === 'string') {
        canvasText = cData;
      }
    }

    return (
      <View style={styles.stimulusBox}>
        <Text style={styles.speakerName}>[교사] {instructor?.id ?? ''}:</Text>
        <Text style={styles.messageText}>{instructor?.text ?? ''}</Text>
        {canvasText ? (
          <View style={{ marginTop: 3, padding: 4, borderWidth: 0.5, borderColor: '#bbb', borderStyle: 'solid' as const }}>
            <Text style={styles.stimulusText}>{canvasText}</Text>
          </View>
        ) : null}
        {students.map((st, i) => (
          <View key={i} style={{ marginTop: 3 }}>
            <Text style={styles.speakerName}>[학생] {st.id ?? ''}:</Text>
            <Text style={styles.messageText}>{st.text ?? ''}</Text>
          </View>
        ))}
      </View>
    );
  }, null);
}

function renderDigitalForumInterface(data: TPL_DIGITAL_FORUM_INTERFACE) {
  return safe(() => {
    const comments = data.comments ?? [];
    return (
      <View style={styles.stimulusBox}>
        <Text style={[styles.stimulusTitle, { marginBottom: 2 }]}>{data.forum_name ?? ''}</Text>
        <Text style={[styles.stimulusText, { fontWeight: 700 }]}>{data.main_post?.title ?? ''}</Text>
        <Text style={[styles.stimulusText, { marginBottom: 3 }]}>{data.main_post?.content ?? ''}</Text>
        {comments.map((c, i) => (
          <View key={i} style={{ marginTop: 2, paddingLeft: 6 }}>
            <Text style={styles.speakerName}>{c.author ?? ''}:</Text>
            <Text style={styles.stimulusText}>{c.text ?? ''}</Text>
          </View>
        ))}
      </View>
    );
  }, null);
}

function renderQuantitativeChart(data: TPL_QUANTITATIVE_CHART) {
  return safe(() => {
    const datasets = data.datasets ?? [];
    const axes = data.axes ?? [];
    if (datasets.length === 0 || axes.length === 0) return null;
    const chartLabel = data.chart_type === 'line'
      ? '꺾은선그래프'
      : data.chart_type === 'radar'
        ? '방사형 그래프'
        : '막대그래프';
    return (
      <View style={styles.stimulusBox}>
        <Text style={styles.stimulusTitle}>[{chartLabel}]</Text>
        <View style={[styles.tableRow, { borderTopWidth: 0.5, borderTopColor: '#999', borderTopStyle: 'solid' as const }]}>
          <Text style={styles.tableCellHeader}>구분</Text>
          {datasets.map((ds, i) => (
            <Text key={i} style={styles.tableCellHeader}>{ds.label ?? ''}</Text>
          ))}
        </View>
        {axes.map((axis, axisIdx) => (
          <View key={axis.key ?? axisIdx} style={styles.tableRow}>
            <Text style={styles.tableCellHeader}>{axis.label}</Text>
            {datasets.map((ds, dsIdx) => (
              <Text key={ds.label ?? dsIdx} style={styles.tableCell}>
                {(ds.values ?? [])[axisIdx] ?? '-'}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  }, null);
}

function renderPromotionalCanvas(data: TPL_PROMOTIONAL_CANVAS) {
  return safe(() => {
    const bullets = data.bullets ?? [];
    const visualElements = data.visual_elements ?? [];
    return (
      <View style={styles.stimulusBox}>
        <Text style={styles.stimulusTitle}>{data.slogan ?? ''}</Text>
        {bullets.map((b, i) => (
          <Text key={i} style={styles.stimulusText}>• {b}</Text>
        ))}
        {visualElements.length > 0 && (
          <View style={{ marginTop: 3 }}>
            {visualElements.map((v, i) => (
              <Text key={i} style={[styles.stimulusText, { color: '#666' }]}>[{v}]</Text>
            ))}
          </View>
        )}
      </View>
    );
  }, null);
}

function renderArticle(data: TPL_ARTICLE) {
  return safe(() => {
    const paragraphs = normalizePdfArticleParagraphs(data.body_paragraphs);
    return (
      <View style={styles.stimulusBox}>
        <Text style={styles.stimulusTitle}>{data.title ?? ''}</Text>
        {data.byline ? <Text style={[styles.stimulusText, { fontSize: 7, color: '#666' }]}>{data.byline}</Text> : null}
        {data.published_date ? <Text style={[styles.stimulusText, { fontSize: 7, color: '#999' }]}>{data.published_date}</Text> : null}
        {paragraphs.map((p, i) => (
          <Text key={i} style={[styles.stimulusText, { marginTop: 2 }]}>{p}</Text>
        ))}
        {data.source ? <Text style={[styles.stimulusText, { fontSize: 7, color: '#999', marginTop: 4 }]}>출처: {data.source}</Text> : null}
      </View>
    );
  }, null);
}

function normalizePdfArticleParagraphs(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap((paragraph) => {
    if (typeof paragraph === 'string') return [paragraph];
    if (
      paragraph &&
      typeof paragraph === 'object' &&
      'content' in paragraph &&
      typeof paragraph.content === 'string'
    ) {
      return [paragraph.content];
    }
    return [];
  });
}

function renderStatistics(data: TPL_STATISTICS) {
  return safe(() => {
    const entries = data.data_entries ?? [];
    return (
      <View style={styles.stimulusBox}>
        <Text style={styles.stimulusTitle}>{data.title ?? ''}</Text>
        {data.category_label ? <Text style={[styles.stimulusText, { fontSize: 7, color: '#666' }]}>구분: {data.category_label}</Text> : null}
        {entries.length > 0 && (
          <View style={{ marginTop: 3 }}>
            <View style={[styles.tableRow, { borderTopWidth: 0.5, borderTopColor: '#999', borderTopStyle: 'solid' as const }]}>
              <Text style={styles.tableCellHeader}>{data.category_label || '항목'}</Text>
              <Text style={styles.tableCellHeader}>{data.unit || '값'}</Text>
            </View>
            {entries.map((e, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.tableCell}>{e.label ?? ''}</Text>
                <Text style={[styles.tableCell, { textAlign: 'right' }]}>{e.value ?? ''}</Text>
              </View>
            ))}
          </View>
        )}
        {data.source ? <Text style={[styles.stimulusText, { fontSize: 7, color: '#999', marginTop: 4 }]}>출처: {data.source}</Text> : null}
      </View>
    );
  }, null);
}

function renderIncidentReport(data: TPL_INCIDENT_REPORT) {
  return safe(() => {
    return (
      <View style={styles.stimulusBox}>
        <Text style={styles.stimulusTitle}>{data.title ?? ''}</Text>
        <Text style={[styles.stimulusText, { fontSize: 7, color: '#e65100', marginBottom: 3 }]}>{data.incident_type ?? ''}</Text>
        {data.date ? <Text style={styles.stimulusText}>발생 일시: {data.date}</Text> : null}
        {data.location ? <Text style={styles.stimulusText}>발생 장소: {data.location}</Text> : null}
        <Text style={[styles.stimulusText, { marginTop: 3 }]}>개요: {data.overview ?? ''}</Text>
        {data.cause ? <Text style={styles.stimulusText}>원인: {data.cause}</Text> : null}
        {data.damage ? <Text style={styles.stimulusText}>피해: {data.damage}</Text> : null}
        {data.timeline && data.timeline.length > 0 ? (
          <View style={{ marginTop: 3 }}>
            {data.timeline.map((ev, i) => (
              <Text key={i} style={styles.stimulusText}>{ev.time ?? ''} → {ev.event ?? ''}</Text>
            ))}
          </View>
        ) : null}
      </View>
    );
  }, null);
}

function renderAnnouncement(data: TPL_ANNOUNCEMENT) {
  return safe(() => {
    return (
      <View style={styles.stimulusBox}>
        <Text style={styles.stimulusTitle}>{data.title ?? ''}</Text>
        <Text style={[styles.stimulusText, { fontSize: 7, color: '#666' }]}>주최: {data.organizer ?? ''}</Text>
        {data.schedule ? (
          <Text style={styles.stimulusText}>기간: {data.schedule.start}{data.schedule.end ? ` ~ ${data.schedule.end}` : ''}</Text>
        ) : null}
        {data.location ? <Text style={styles.stimulusText}>장소: {data.location}</Text> : null}
        {data.target ? <Text style={styles.stimulusText}>대상: {data.target}</Text> : null}
        {(data.details ?? []).map((d, i) => (
          <Text key={i} style={styles.stimulusText}>[{d.label ?? ''}] {d.content ?? ''}</Text>
        ))}
        {data.contact ? <Text style={[styles.stimulusText, { marginTop: 3 }]}>문의: {data.contact}</Text> : null}
      </View>
    );
  }, null);
}

function renderReport(data: TPL_REPORT) {
  return safe(() => {
    const sections = data.sections ?? [];
    return (
      <View style={styles.stimulusBox}>
        <Text style={styles.stimulusTitle}>{data.title ?? ''}</Text>
        {data.author || data.date ? (
          <Text style={[styles.stimulusText, { fontSize: 7, color: '#666', marginBottom: 3 }]}>
            {data.author ? `작성자: ${data.author}` : ''}{data.author && data.date ? ' | ' : ''}{data.date ? `작성일: ${data.date}` : ''}
          </Text>
        ) : null}
        {sections.map((s, i) => (
          <View key={i} style={{ marginTop: 3 }}>
            <Text style={[styles.stimulusText, { fontWeight: 700 }]}>{s.heading ?? ''}</Text>
            <Text style={styles.stimulusText}>{s.content ?? ''}</Text>
          </View>
        ))}
        {data.conclusion ? (
          <View style={{ marginTop: 4, borderTopWidth: 0.5, borderTopColor: '#ccc', borderTopStyle: 'solid' as const, paddingTop: 2 }}>
            <Text style={[styles.stimulusText, { fontWeight: 700 }]}>결론</Text>
            <Text style={styles.stimulusText}>{data.conclusion}</Text>
          </View>
        ) : null}
      </View>
    );
  }, null);
}

export function PdfStimulusRenderer({ template, data }: Props) {
  if (!data) return null;

  switch (template) {
    case 'TPL_COMPARATIVE_MATRIX':
      return renderComparativeMatrix(data as TPL_COMPARATIVE_MATRIX);
    case 'TPL_FORMAL_DOCUMENT':
      return renderFormalDocument(data as TPL_FORMAL_DOCUMENT);
    case 'TPL_CONVERSATIONAL_FLOW':
      return renderConversationalFlow(data as TPL_CONVERSATIONAL_FLOW);
    case 'TPL_CASE_DIAGNOSTIC_FRAME':
      return renderCaseDiagnosticFrame(data as TPL_CASE_DIAGNOSTIC_FRAME);
    case 'TPL_SEQUENTIAL_WORKFLOW':
      return renderSequentialWorkflow(data as TPL_SEQUENTIAL_WORKFLOW);
    case 'TPL_INSTRUCTIONAL_SCENE':
      return renderInstructionalScene(data as TPL_INSTRUCTIONAL_SCENE);
    case 'TPL_DIGITAL_FORUM_INTERFACE':
      return renderDigitalForumInterface(data as TPL_DIGITAL_FORUM_INTERFACE);
    case 'TPL_QUANTITATIVE_CHART':
      return renderQuantitativeChart(data as TPL_QUANTITATIVE_CHART);
    case 'TPL_PROMOTIONAL_CANVAS':
      return renderPromotionalCanvas(data as TPL_PROMOTIONAL_CANVAS);
    case 'TPL_ARTICLE':
      return renderArticle(data as TPL_ARTICLE);
    case 'TPL_STATISTICS':
      return renderStatistics(data as TPL_STATISTICS);
    case 'TPL_INCIDENT_REPORT':
      return renderIncidentReport(data as TPL_INCIDENT_REPORT);
    case 'TPL_ANNOUNCEMENT':
      return renderAnnouncement(data as TPL_ANNOUNCEMENT);
    case 'TPL_REPORT':
      return renderReport(data as TPL_REPORT);
    default:
      if (typeof data === 'string' && data.trim()) {
        return (
          <View style={styles.stimulusBox}>
            <Text style={styles.stimulusText}>{data}</Text>
          </View>
        );
      }
      if (typeof data === 'object' && data !== null) {
        // PLAIN_TEXT fallback: { data: '' } 인 경우 빈칸 출력 방지
        if ('data' in data && data.data === '') return null;
        return (
          <View style={styles.stimulusBox}>
            <Text style={styles.stimulusText}>{JSON.stringify(data, null, 2)}</Text>
          </View>
        );
      }
      return null;
  }
}
