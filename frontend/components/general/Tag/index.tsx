import React, { ReactNode } from 'react';
import { HStack } from '../HStack';
import Typo from '../Typo';
import { SPACING } from '@shared/constants/spacing';
import s from './style.module.scss';

interface TagProps {
    children: ReactNode;
}

export function Tag({ children }: TagProps) {
    return (
        <HStack className={s.tag} align="center" justify="center" gap={SPACING.s10}>
            <Typo.MD size={14} color="brand">{children}</Typo.MD>
        </HStack>
    );
}
