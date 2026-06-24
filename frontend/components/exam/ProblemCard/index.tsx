"use client";
import React from 'react';
import { HStack } from '../../general/HStack';
import { VStack } from '../../general/VStack';
import Typo from '../../general/Typo';
import { SPACING } from '@shared/constants/spacing';
import s from './style.module.scss';
import { ProblemItem } from '../ProblemList';

interface ProblemCardProps {
    item: ProblemItem;
    onClick?: () => void;
}

export function ProblemCard({ item, onClick }: ProblemCardProps) {
    return (
        <HStack 
            fullWidth 
            justify="between" 
            align="center" 
            className={`${s.card} ${item.active ? s.active : ''}`}
            onClick={onClick}
        >
            <VStack gap={SPACING.s8}>
                <Typo.MD size={16} color="primary">{item.range}</Typo.MD>
                <Typo.SM size={12} color="secondary">난이도 - {item.diff}</Typo.SM>
                <Typo.SM size={12} color="secondary">문제수 - {item.count}문제</Typo.SM>
            </VStack>
            <Typo.SM size={16} color="brand">{item.score}</Typo.SM>
        </HStack>
    );
}
