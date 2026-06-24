'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { HStack } from '@/components/general/HStack';
import { Bell, Moon, User } from 'lucide-react';
import { SPACING } from '@/constants/spacing';
import { fetchNotifications, markNotificationRead, type NotificationItem } from '@/lib/notificationApi';
import { useTheme } from '@shared/contexts/ThemeContext';
import { SM, MD } from '@/components/general/Typo';
import s from './style.module.scss';

interface HeaderActionsProps {
    showUser?: boolean;
}

export function HeaderActions({ showUser = false }: HeaderActionsProps) {
    const router = useRouter();
    const { toggleTheme } = useTheme();
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchNotifications()
            .then((data) => {
                setNotifications(data.notifications);
                setUnreadCount(data.unreadCount);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNotificationClick = async (notification: NotificationItem) => {
        if (!notification.isRead) {
            await markNotificationRead(notification.id);
            setUnreadCount((c) => Math.max(0, c - 1));
            setNotifications((prev) =>
                prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
            );
        }
        setShowDropdown(false);

        switch (notification.type) {
            case 'EXAM_COMPLETE':
                router.push('/exam/success');
                break;
            case 'REVIEW_REMINDER':
                router.push('/review');
                break;
            default:
                router.push('/');
        }
    };

    return (
        <HStack gap={SPACING.s16} align="center" style={{ padding: SPACING.s12 }}>
            <div className={s.bellWrapper} ref={dropdownRef}>
                <div className={s.iconCircle} onClick={() => setShowDropdown(!showDropdown)}>
                    <Bell size={20} color="var(--text-primary)" />
                    {unreadCount > 0 && (
                        <span className={s.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
                    )}
                </div>
                {showDropdown && (
                    <div className={s.dropdown}>
                        <div className={s.dropdownHeader}>
                            <SM size={14} color="primary">알림</SM>
                        </div>
                        {notifications.length === 0 ? (
                            <div className={s.emptyState}>
                                <MD size={14} color="secondary">알림이 없습니다</MD>
                            </div>
                        ) : (
                            <div className={s.notificationList}>
                                {notifications.map((n) => (
                                    <div
                                        key={n.id}
                                        className={`${s.notificationItem} ${!n.isRead ? s.unread : ''}`}
                                        onClick={() => handleNotificationClick(n)}
                                    >
                                        <SM size={14} color="primary">{n.title}</SM>
                                        <MD size={12} color="secondary">{n.message}</MD>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className={s.iconCircle} onClick={toggleTheme} style={{ cursor: 'pointer' }}>
                <Moon size={20} color="var(--text-primary)" />
            </div>
        </HStack>
    );
}
