import React, { useState } from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import Typo from '@shared/ui/Typo';
import { SPACING } from '@shared/constants/spacing';
import s from './style.module.scss';

export interface SubUnit {
    id: number;
    title: string;
    isActive: boolean;
    status: 'completed' | 'in_progress' | 'not_started';
    progress?: number;
    lastStudiedAt?: Date | string;
}

interface UnitCardProps {
    unitNumber: number;
    progress: number;
    subUnits: SubUnit[];
    isExpandedDefault?: boolean;
    isExpanded?: boolean;
    onClick?: () => void;
}

export function UnitCard({ unitNumber, progress, subUnits, isExpandedDefault = false, isExpanded, onClick }: UnitCardProps) {
    const [localExpanded, setLocalExpanded] = useState(isExpandedDefault);
    const expanded = isExpanded !== undefined ? isExpanded : localExpanded;

    const handleExpand = () => {
        if (onClick) onClick();
        if (isExpanded === undefined) {
            setLocalExpanded(!localExpanded);
        }
    };

    return (
        <div className={`${s.card} ${expanded ? s.expanded : s.collapsed}`} onClick={handleExpand}>
            <VStack gap={expanded ? SPACING.s16 : SPACING.s12} fullWidth>
                {/* Header */}
                <HStack align="center" justify="between" fullWidth>
                    <Typo.SM size={20} color="primary">{unitNumber}단원</Typo.SM>

                    <HStack gap={SPACING.s6} align="center">
                        {!expanded && (
                            <Typo.MD size={14} color={progress === 100 ? "brand" : "secondary"} style={{ fontWeight: progress === 100 ? 600 : 500 }}>
                                {progress}%
                            </Typo.MD>
                        )}
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#5C6370" className={`${s.arrow} ${expanded ? s.expanded : ''}`}>
                            <path d="M5 7.5L10 12.5L15 7.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </HStack>
                </HStack>

                {/* Expanded Content */}
                {expanded && (
                    <VStack gap={SPACING.s10} fullWidth style={{ padding: SPACING.s8 }}>
                        {subUnits.map((sub) => {
                            const circleClass =
                                sub.status === 'completed' ? s.completed
                                : sub.status === 'in_progress' ? s.inProgress
                                : s.notStarted;
                            const textColor =
                                sub.status === 'completed' ? 'inverted'
                                : sub.status === 'in_progress' ? 'brand'
                                : 'secondary';
                            return (
                                <div key={sub.id} className={s.subUnitItem} onClick={(e) => {
                                    e.stopPropagation();
                                }}>
                                    <div className={`${s.circle} ${circleClass}`}>
                                        <Typo.MD size={14} color={textColor} style={{ fontWeight: 600 }}>
                                            {sub.id}
                                        </Typo.MD>
                                    </div>
                                    <Typo.MD
                                        size={14}
                                        color={sub.status === 'in_progress' ? 'brand' : sub.status === 'completed' ? 'primary' : 'secondary'}
                                        style={{ fontWeight: sub.status !== 'not_started' ? 600 : 500 }}
                                    >
                                        {sub.title}
                                    </Typo.MD>
                                </div>
                            );
                        })}
                    </VStack>
                )}
            </VStack>
        </div>
    );
}
