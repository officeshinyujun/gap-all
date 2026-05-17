import React, { createElement, forwardRef } from "react";
import cs from 'classnames';
import s from './style.module.scss';

// Figma에 정의된 사이즈 체계
export type TypoSize = 10 | 12 | 14 | 16 | 20 | 24 | 32;

export type ColorType = 
    | 'primary' 
    | 'secondary' 
    | 'inverted' 
    | 'brand' 
    | 'correct' 
    | 'wrong' 
    | 'background-secondary' 
    | 'background-third' 
    | 'border' 
    | (string & {});

export interface TypoProps extends React.HTMLAttributes<HTMLElement> {
    as?: React.ElementType;
    size?: TypoSize;
    color?: ColorType;
}

const getTypoClass = (color?: ColorType) => {
    // style.module.scss에 정의된 색상인지 확인
    const isPredefinedColor = color && !!(s as any)[color];
    return isPredefinedColor ? (s as any)[color] : undefined;
};

const getTypoStyle = (color?: ColorType, style?: React.CSSProperties, size?: TypoSize) => {
    const isPredefinedColor = color && !!(s as any)[color];
    return {
        ...style,
        ...(color && !isPredefinedColor ? { color } : {}), // 커스텀 hex 색상 지원
        ...(size ? { fontSize: `${size}px` } : {}),        // 사이즈 직접 주입
    };
};

const createTypoComponent = (weightClass: string, displayName: string) => {
    // 1. 기본 두께 컴포넌트 (size prop으로 조절)
    const Component = forwardRef<HTMLElement, TypoProps>(({ 
        as = 'p', 
        size = 14, 
        color, 
        className, 
        style, 
        children, 
        ...props 
    }, ref) => {
        return createElement(as, {
            ref,
            className: cs(className, weightClass, getTypoClass(color)),
            style: getTypoStyle(color, style, size),
            ...props
        }, children);
    });

    Component.displayName = displayName;

    // 2. 내부 사이즈 컴포넌트 추가 (e.g. <Typo.MD.Size14>)
    const sizes: TypoSize[] = [10, 12, 14, 16, 20, 24, 32];
    const sizeComponents = {} as Record<`Size${TypoSize}`, React.FC<Omit<TypoProps, 'size'>>>;
    
    sizes.forEach(size => {
        const SizeComponent = forwardRef<HTMLElement, Omit<TypoProps, 'size'>>((props, ref) => (
            <Component ref={ref} size={size} {...props} />
        ));
        SizeComponent.displayName = `${displayName}.Size${size}`;
        sizeComponents[`Size${size}` as const] = SizeComponent as any;
    });

    return Object.assign(Component, sizeComponents);
};

// Figma 기준 두께 매핑 (TH, MD, SM, BD)
export const TH = createTypoComponent(s.light, 'Typo.TH'); // Thin (or Light)
export const MD = createTypoComponent(s.medium, 'Typo.MD'); // Medium
export const SM = createTypoComponent(s['semi-bold'], 'Typo.SM'); // Semi-bold
export const BD = createTypoComponent(s.bold, 'Typo.BD'); // Bold

const Typo = {
    TH,
    MD,
    SM,
    BD
};

export default Typo;