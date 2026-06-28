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
    const participantMap = new Map(participants.map((p) => [p.id, p.name]));
    return (
      <View style={styles.stimulusBox}>
        {messages.map((msg, i) => (
          <View key={i} style={{ marginBottom: 3 }}>
            <Text style={styles.speakerName}>{participantMap.get(msg.p_id) ?? msg.p_id}:</Text>
            <Text style={styles.messageText}>{msg.text ?? ''}</Text>
          </View>
        ))}
      </View>
    );
  }, null);
}

function renderCaseDiagnosticFrame(data: TPL_CASE_DIAGNOSTIC_FRAME) {
  return safe(() => {
    const profile = data.case_profile;
    const checkItems = Array.isArray(data.check_items) ? data.check_items : [];
    return (
      <View style={styles.stimulusBox}>
        <Text style={styles.stimulusTitle}>[사례] {profile?.name ?? ''}</Text>
        <Text style={styles.stimulusText}>{profile?.context ?? ''}</Text>
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
              <Text style={styles.stepLabel}>{step.label ?? ''}</Text>
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
    if (datasets.length === 0) return null;
    return (
      <View style={styles.stimulusBox}>
        <Text style={styles.stimulusTitle}>[{data.chart_type ?? 'bar'} 차트]</Text>
        {datasets.map((ds, i) => (
          <Text key={i} style={styles.stimulusText}>
            {ds.label ?? ''}: {(ds.values ?? []).map((v, vi) => `${axes[vi]?.label ?? vi}=${v}`).join(', ')}
          </Text>
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
    default:
      if (typeof data === 'string') {
        return (
          <View style={styles.stimulusBox}>
            <Text style={styles.stimulusText}>{data}</Text>
          </View>
        );
      }
      if (typeof data === 'object' && data !== null) {
        return (
          <View style={styles.stimulusBox}>
            <Text style={styles.stimulusText}>{JSON.stringify(data, null, 2)}</Text>
          </View>
        );
      }
      return null;
  }
}
