"use client";
import React, { useState } from 'react';
import { VStack } from '../../general/VStack';
import { ProblemCard } from '../ProblemCard';
import { SPACING } from '@shared/constants/spacing';
import s from './style.module.scss';

export interface ProblemItem {
    id?: string;
    range: string;
    diff: string;
    count: number;
    score: string;
    active?: boolean;
    description?: string;
    tags?: string[];
    previewUrl?: string;
    createdAt?: string;
}

interface ProblemListProps {
    items: ProblemItem[];
    onSelect?: (item: ProblemItem) => void;
}

export function ProblemList({ items, onSelect }: ProblemListProps) {
    const [activeIndex, setActiveIndex] = useState<number>(() => items.findIndex(item => item.active));

    return (
        <VStack className={s.listContainer} fullWidth gap={SPACING.s12}>
            {items.map((item, i) => (
                <ProblemCard 
                    key={i} 
                    item={{ ...item, active: activeIndex === i }} 
                    onClick={() => {
                        setActiveIndex(i);
                        onSelect?.(item);
                    }} 
                />
            ))}
        </VStack>
    );
}
