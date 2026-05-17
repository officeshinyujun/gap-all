import React, { useState, useRef, useEffect } from 'react';
import Typo from '../Typo';
import s from './style.module.scss';

export interface SelectOption {
    label: string;
    value: string | number;
    disabled?: boolean;
}

interface SelectProps {
    value: string | number;
    options: SelectOption[];
    onChange: (value: string | number) => void;
}

export function Select({ value, options, onChange }: SelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(o => o.value === value) || options[0];

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={s.container} ref={containerRef}>
            <div className={`${s.trigger} ${isOpen ? s.open : ''}`} onClick={() => setIsOpen(!isOpen)}>
                <Typo.MD size={14} color="primary">{selectedOption?.label}</Typo.MD>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" className={s.icon}>
                    <path d="M4 6L8 10L12 6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </div>
            
            {isOpen && (
                <div className={s.dropdown}>
                    {options.map((option, idx) => (
                        <div 
                            key={idx}
                            className={`${s.option} ${option.disabled ? s.disabled : ''} ${option.value === value ? s.selected : ''}`}
                            onClick={() => {
                                if (!option.disabled) {
                                    onChange(option.value);
                                    setIsOpen(false);
                                }
                            }}
                        >
                            <Typo.MD size={14} color={option.disabled ? "secondary" : option.value === value ? "brand" : "primary"}>
                                {option.label}
                            </Typo.MD>
                            {option.value === value && (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#3E78F7">
                                    <path d="M3.33334 8L6.66668 11.3333L13.3333 4.66667" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
