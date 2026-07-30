'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { HStack } from '@shared/ui/HStack';
import { Bell, Moon, User, X } from 'lucide-react';
import { SPACING } from '@/constants/spacing';
import { fetchNotifications, markNotificationRead, deleteNotification, type NotificationItem } from '@/lib/notificationApi';
import { useTheme } from '@shared/contexts/ThemeContext';
import { SM, MD } from '@shared/ui/Typo';
import s from './style.module.scss';

interface HeaderActionsProps {
    showUser?: boolean;
}

export function HeaderActions({ showUser = false }: HeaderActionsProps) {
    const navigate = useNavigate();
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
                navigate('/exam/success');
                break;
            case 'REVIEW_REMINDER':
                navigate('/review');
                break;
            default:
                navigate('/');
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            await deleteNotification(id);
            setNotifications((prev) => {
                const item = prev.find((n) => n.id === id);
                if (item && !item.isRead) {
                    setUnreadCount((c) => Math.max(0, c - 1));
                }
                return prev.filter((n) => n.id !== id);
            });
        } catch {}
    };

    return (
        <HStack gap={SPACING.s16} align="center" style={{ padding: SPACING.s12 }}>
            <div className={s.bellWrapper} ref={dropdownRef}>
                <div className={s.iconCircle} onClick={() => setShowDropdown(!showDropdown)}>
                    <Bell size={20} />
                    {unreadCount > 0 && (
                        <span className={s.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
                    )}
                </div>
                {showDropdown && (
                    <>
                        <div className={s.backdrop} onClick={() => setShowDropdown(false)} />
                        <div className={s.dropdown}>
                        <div className={s.dropdownHeader}>
                            <SM size={14} color="primary">알림</SM>
                            <button className={s.closeBtn} onClick={() => setShowDropdown(false)} aria-label="닫기">
                                <X size={18} />
                            </button>
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
                                        <div className={s.notificationBody}>
                                            <SM size={14} color="primary">{n.title}</SM>
                                            <MD size={12} color="secondary">{n.message}</MD>
                                        </div>
                                        <button
                                            className={s.deleteBtn}
                                            onClick={(e) => handleDelete(e, n.id)}
                                            aria-label="알림 삭제"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        </div>
                    </>
                )}
            </div>
            <div className={s.iconCircle} onClick={toggleTheme} style={{ cursor: 'pointer' }}>
                <Moon size={20} />
            </div>
        </HStack>
    );
}
