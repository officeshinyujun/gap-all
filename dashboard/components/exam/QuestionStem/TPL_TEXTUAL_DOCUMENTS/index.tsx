import React from 'react';
import { HStack } from '@/components/general/HStack';
import { VStack } from '@/components/general/VStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import type {
  StatisticsEntry,
  TPL_ANNOUNCEMENT,
  TPL_ARTICLE,
  TPL_INCIDENT_REPORT,
  TPL_REPORT,
  TPL_STATISTICS,
} from '@/types/questionstem';
import s from './index.module.scss';

interface TemplateProps<T> { data: T; label?: string; }

function TemplateFrame({ children, label }: { children: React.ReactNode; label?: string }) {
  return <StemBox><VStack gap={16} fullWidth><StemLabel>{label}</StemLabel>{children}</VStack></StemBox>;
}

function DocumentSection({ heading, content }: { heading: string; content: string }) {
  return <div className={s.section}><h3>{heading}</h3><p className={s.paragraph}>{content}</p></div>;
}

export function TPLArticle({ data, label }: TemplateProps<TPL_ARTICLE>) {
  return <TemplateFrame label={label}><article className={s.box}>
    <h2 className={s.title}>{data.title}</h2>
    {(data.byline || data.published_date) && <p className={s.muted}>{[data.byline, data.published_date].filter(Boolean).join(' · ')}</p>}
    {data.body_paragraphs.map((paragraph, index) => <p key={index} className={s.paragraph}>{paragraph}</p>)}
    {data.source && <p className={s.source}>출처: {data.source}</p>}
  </article></TemplateFrame>;
}

export function TPLStatistics({ data, label }: TemplateProps<TPL_STATISTICS>) {
  return <TemplateFrame label={label}><section className={s.box}>
    <h2 className={s.title}>{data.title}</h2>{data.category_label && <p className={s.muted}>구분: {data.category_label}</p>}
    <table className={s.table}><thead><tr><th>{data.category_label || '항목'}</th><th>{data.unit || '값'}</th></tr></thead><tbody>
      {data.data_entries.map((entry: StatisticsEntry, index) => <tr key={index}><td>{entry.label}{entry.sub_label && <span className={s.subtle}> ({entry.sub_label})</span>}</td><td className={s.value}>{entry.value}</td></tr>)}
    </tbody></table>{data.source && <p className={s.source}>출처: {data.source}</p>}
  </section></TemplateFrame>;
}

export function TPLIncidentReport({ data, label }: TemplateProps<TPL_INCIDENT_REPORT>) {
  const facts = [['발생 일시', data.date], ['발생 장소', data.location], ['피해', data.damage], ['대응', data.response], ['예방 대책', data.prevention]].filter(([, value]) => value);
  return <TemplateFrame label={label}><section className={s.box}>
    <h2 className={s.title}>{data.title}</h2><span className={s.badge}>{data.incident_type}</span>
    {facts.length > 0 && <div className={s.factGrid}>{facts.map(([name, value]) => <div key={name}><span className={s.subtle}>{name}: </span>{value}</div>)}</div>}
    <DocumentSection heading="사고 개요" content={data.overview} />
    {data.cause && <DocumentSection heading="발생 원인" content={data.cause} />}
    {!!data.timeline?.length && <div className={s.section}><h3>타임라인</h3>{data.timeline.map((event, index) => <HStack key={index} gap={8}><span className={s.timelineTime}>{event.time}</span><span>→</span><span>{event.event}</span></HStack>)}</div>}
  </section></TemplateFrame>;
}

export function TPLAnnouncement({ data, label }: TemplateProps<TPL_ANNOUNCEMENT>) {
  return <TemplateFrame label={label}><section className={s.box}>
    <h2 className={s.title}>{data.title}</h2>
    <p className={s.muted}>주최: {data.organizer}{data.schedule && ` · 기간: ${data.schedule.start}${data.schedule.end ? ` ~ ${data.schedule.end}` : ''}`}</p>
    {data.target && <p className={s.muted}>대상: {data.target}</p>}{data.location && <p className={s.muted}>장소: {data.location}</p>}
    <div className={s.details}>{data.details.map((detail, index) => <p key={index}><strong>[{detail.label}]</strong> {detail.content}</p>)}</div>
    {data.contact && <p className={s.source}>문의: {data.contact}</p>}
  </section></TemplateFrame>;
}

export function TPLReport({ data, label }: TemplateProps<TPL_REPORT>) {
  return <TemplateFrame label={label}><section className={s.box}>
    <h2 className={s.title}>{data.title}</h2>
    {(data.author || data.date) && <p className={s.muted}>{data.author && `작성자: ${data.author}`}{data.author && data.date && ' · '}{data.date && `작성일: ${data.date}`}</p>}
    {!!data.metadata?.length && <div className={s.factGrid}>{data.metadata.map((item, index) => <div key={index}><span className={s.subtle}>{item.label}: </span>{item.value}</div>)}</div>}
    {data.sections.map((section, index) => <div key={index} className={s.section}><DocumentSection heading={section.heading} content={section.content} />{section.table && <table className={s.table}><thead><tr>{section.table.headers.map((header, column) => <th key={column}>{header}</th>)}</tr></thead><tbody>{section.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table>}</div>)}
    {data.conclusion && <DocumentSection heading="결론" content={data.conclusion} />}
  </section></TemplateFrame>;
}
