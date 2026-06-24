'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import Typo from '@shared/ui/Typo';
import { HeaderActions } from '@shared/ui/HeaderActions';
import { SPACING } from '@shared/constants/spacing';
import s from './page.module.scss';
import { User } from 'lucide-react';
import {
    fetchNotificationSettings,
    updateNotificationSettings,
    NotificationSettings,
} from '@/lib/notificationApi';
import { fetchUserProfile, fetchUserStats, deleteAccount, type UserProfile, type UserStats } from '@/lib/userApi';
import { useAuth } from '@shared/contexts/AuthContext';
import { fetchUnitsWithProgress } from '@/lib/studyApi';
import { registerPushSubscription, unregisterPushSubscription } from '@/utils/pushSubscription';

const SUBJECTS = [
    { slug: 'success', name: '성공적인 직업생활' },
    { slug: 'industry', name: '공업 일반' },
];

const FREQUENCY_OPTIONS = [
    { label: '매일', value: 1 },
    { label: '2일마다', value: 2 },
    { label: '3일마다', value: 3 },
    { label: '일주일마다', value: 7 },
];

const CONDITION_OPTIONS = [
    { label: '1일 미복습', value: 1 },
    { label: '2일 미복습', value: 2 },
    { label: '3일 미복습', value: 3 },
    { label: '일주일 미복습', value: 7 },
];

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export default function ProfilePage() {
    const { logout } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [subjectProgress, setSubjectProgress] = useState<{ name: string; progress: number }[]>([]);
    const [settings, setSettings] = useState<NotificationSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [reviewEnabled, setReviewEnabled] = useState(true);

    useEffect(() => {
        Promise.allSettled([
            fetchUserProfile(),
            fetchUserStats(),
            fetchNotificationSettings(),
            ...SUBJECTS.map(async (sub) => {
                const data = await fetchUnitsWithProgress(sub.slug);
                const totalProgress = data.units.length > 0
                    ? Math.round(data.units.reduce((sum, u) => sum + u.progress, 0) / data.units.length)
                    : 0;
                return { name: sub.name, progress: totalProgress };
            }),
        ]).then((results) => {
            if (results[0].status === 'fulfilled') setProfile(results[0].value);
            if (results[1].status === 'fulfilled') setStats(results[1].value);
            if (results[2].status === 'fulfilled') setSettings(results[2].value);

            const progressResults = results.slice(3);
            const progressData: { name: string; progress: number }[] = [];
            progressResults.forEach((r) => {
                if (r.status === 'fulfilled') progressData.push(r.value as { name: string; progress: number });
            });
            setSubjectProgress(progressData);
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        const stored = localStorage.getItem('gap_review_enabled');
        if (stored !== null) {
            setReviewEnabled(stored === 'true');
        }
    }, []);

    function handleReviewToggle(enabled: boolean) {
        setReviewEnabled(enabled);
        localStorage.setItem('gap_review_enabled', String(enabled));
    }

    const handleUpdate = useCallback(
        async (patch: Partial<NotificationSettings>) => {
            if (!settings) return;
            const optimistic = { ...settings, ...patch };
            setSettings(optimistic);
            try {
                const updated = await updateNotificationSettings(patch);
                setSettings(updated);
            } catch {
                setSettings(settings);
            }
        },
        [settings],
    );

    const handlePushToggle = useCallback(
        async (enabled: boolean) => {
            if (enabled) {
                try {
                    await registerPushSubscription(VAPID_PUBLIC_KEY);
                    handleUpdate({ pushEnabled: true });
                } catch {
                    // permission denied
                }
            } else {
                try {
                    await unregisterPushSubscription();
                    handleUpdate({ pushEnabled: false });
                } catch {
                    // ignore
                }
            }
        },
        [handleUpdate],
    );

    if (loading) {
        return (
            <VStack fullWidth fullHeight align="center" justify="center">
                <div className={s.spinner} />
            </VStack>
        );
    }

    const studyStats = [
        { label: '학습 연속일', value: `${stats?.studyStreakDays ?? 0}일`, highlight: true },
        { label: '총 학습일', value: `${stats?.totalStudyDays ?? 0}일`, highlight: false },
        { label: '완료한 단원', value: `${stats?.completedUnits ?? 0}단원`, highlight: false },
        { label: '응시한 문제', value: `${stats?.examsTaken ?? 0}회`, highlight: false },
    ];

    return (
        <VStack fullWidth fullHeight gap={SPACING.s24} className={s.container}>
            <HStack fullWidth justify="between" align="center">
                <VStack gap={SPACING.s6}>
                    <Typo.SM size={24} color="primary">프로필</Typo.SM>
                    <Typo.MD size={12} color="secondary">내 학습 현황을 확인하세요</Typo.MD>
                </VStack>
                <HeaderActions />
            </HStack>

            <div className={s.profileCard}>
                <div className={s.avatar}>
                    <User size={32} color="var(--text-secondary)" />
                </div>
                <VStack gap={SPACING.s6} style={{ flex: 1 }}>
                    <Typo.SM size={20} color="primary">{profile?.name ?? ''}</Typo.SM>
                    <Typo.MD size={14} color="secondary">{profile?.email ?? ''}</Typo.MD>
                    {(profile?.school || profile?.grade) && (
                        <HStack gap={SPACING.s8} style={{ marginTop: SPACING.s4 }}>
                            {profile?.school && (
                                <div className={s.badge}>
                                    <Typo.MD size={12} color="brand">{profile.school}</Typo.MD>
                                </div>
                            )}
                            {profile?.grade && (
                                <div className={s.badge}>
                                    <Typo.MD size={12} color="brand">{profile.grade}</Typo.MD>
                                </div>
                            )}
                        </HStack>
                    )}
                </VStack>
            </div>

            <HStack fullWidth gap={SPACING.s16} align="start" className={s.statsColumns}>
                <VStack className={s.section} style={{ flex: 1 }}>
                    <div className={s.sectionTitle}>
                        <Typo.SM size={16} color="primary">학습 통계</Typo.SM>
                    </div>
                    <VStack gap={SPACING.s12} fullWidth>
                        {studyStats.map((stat) => (
                            <div key={stat.label} className={s.row}>
                                <Typo.MD size={14} color="secondary">{stat.label}</Typo.MD>
                                {stat.highlight ? (
                                    <div className={s.streakBadge}>
                                        <Typo.SM size={14} color="inverted">{stat.value}</Typo.SM>
                                    </div>
                                ) : (
                                    <Typo.SM size={14} color="primary">{stat.value}</Typo.SM>
                                )}
                            </div>
                        ))}
                    </VStack>
                </VStack>

                <VStack className={s.section} style={{ flex: 1 }}>
                    <div className={s.sectionTitle}>
                        <Typo.SM size={16} color="primary">과목별 진행률</Typo.SM>
                    </div>
                    <VStack gap={SPACING.s16} fullWidth>
                        {subjectProgress.map((subject) => (
                            <VStack key={subject.name} gap={SPACING.s8} fullWidth>
                                <div className={s.row}>
                                    <Typo.MD size={14} color="primary">{subject.name}</Typo.MD>
                                    <Typo.MD size={14} color="brand" style={{ fontWeight: 600 }}>{subject.progress}%</Typo.MD>
                                </div>
                                <div style={{
                                    width: '100%',
                                    height: 8,
                                    background: 'var(--background-third)',
                                    borderRadius: 99,
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        width: `${subject.progress}%`,
                                        height: '100%',
                                        background: 'var(--brand-primary)',
                                        borderRadius: 99,
                                        transition: 'width 0.4s ease',
                                    }} />
                                </div>
                            </VStack>
                        ))}
                    </VStack>
                </VStack>
            </HStack>

            {settings && (
                <VStack gap={SPACING.s16} fullWidth className={s.settingsSection}>
                    <div className={s.sectionTitle}>
                        <Typo.SM size={16} color="primary">기능 설정</Typo.SM>
                    </div>
                    <HStack justify="between" align="center" fullWidth className={s.settingRow}>
                        <VStack gap={SPACING.s4}>
                            <Typo.SM size={14} color="primary">복습 기능</Typo.SM>
                            <Typo.MD size={12} color="secondary">오답 복습 메뉴를 표시합니다</Typo.MD>
                        </VStack>
                        <label className={s.toggle}>
                            <input
                                type="checkbox"
                                checked={reviewEnabled}
                                onChange={(e) => handleReviewToggle(e.target.checked)}
                            />
                            <span className={s.slider} />
                        </label>
                    </HStack>
                </VStack>
            )}

            {settings && (
                <VStack gap={SPACING.s16} fullWidth className={s.settingsSection}>
                    <div className={s.sectionTitle}>
                        <Typo.SM size={16} color="primary">알림 설정</Typo.SM>
                    </div>

                    <HStack justify="between" align="center" fullWidth className={s.settingRow}>
                        <VStack gap={SPACING.s4}>
                            <Typo.SM size={14} color="primary">복습 알림</Typo.SM>
                            <Typo.MD size={12} color="secondary">오답 복습 알림을 받습니다</Typo.MD>
                        </VStack>
                        <label className={s.toggle}>
                            <input
                                type="checkbox"
                                checked={settings.reminderEnabled}
                                onChange={(e) => handleUpdate({ reminderEnabled: e.target.checked })}
                            />
                            <span className={s.slider} />
                        </label>
                    </HStack>

                    <HStack justify="between" align="center" fullWidth className={s.settingRow}>
                        <VStack gap={SPACING.s4}>
                            <Typo.SM size={14} color="primary">알림 주기</Typo.SM>
                            <Typo.MD size={12} color="secondary">얼마나 자주 알림을 받을지 설정합니다</Typo.MD>
                        </VStack>
                        <select
                            className={s.select}
                            value={settings.reminderFrequencyDays}
                            onChange={(e) => handleUpdate({ reminderFrequencyDays: Number(e.target.value) })}
                        >
                            {FREQUENCY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </HStack>

                    <HStack justify="between" align="center" fullWidth className={s.settingRow}>
                        <VStack gap={SPACING.s4}>
                            <Typo.SM size={14} color="primary">알림 조건</Typo.SM>
                            <Typo.MD size={12} color="secondary">복습하지 않은 기간 기준</Typo.MD>
                        </VStack>
                        <select
                            className={s.select}
                            value={settings.reminderConditionDays}
                            onChange={(e) => handleUpdate({ reminderConditionDays: Number(e.target.value) })}
                        >
                            {CONDITION_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </HStack>

                    <HStack justify="between" align="center" fullWidth className={s.settingRow}>
                        <VStack gap={SPACING.s4}>
                            <Typo.SM size={14} color="primary">알림 시간</Typo.SM>
                            <Typo.MD size={12} color="secondary">알림을 받을 시간을 설정합니다</Typo.MD>
                        </VStack>
                        <input
                            type="time"
                            className={s.timeInput}
                            value={settings.reminderTime ?? '09:00'}
                            onChange={(e) => handleUpdate({ reminderTime: e.target.value })}
                        />
                    </HStack>

                    <HStack justify="between" align="center" fullWidth className={s.settingRow}>
                        <VStack gap={SPACING.s4}>
                            <Typo.SM size={14} color="primary">푸시 알림</Typo.SM>
                            <Typo.MD size={12} color="secondary">브라우저 푸시 알림을 받습니다</Typo.MD>
                        </VStack>
                        <label className={s.toggle}>
                            <input
                                type="checkbox"
                                checked={settings.pushEnabled}
                                onChange={(e) => handlePushToggle(e.target.checked)}
                            />
                            <span className={s.slider} />
                        </label>
                    </HStack>
                </VStack>
            )}

            <VStack gap={SPACING.s16} fullWidth className={s.settingsSection}>
                <div className={s.sectionTitle}>
                    <Typo.SM size={16} color="primary">계정</Typo.SM>
                </div>
                <HStack justify="between" align="center" fullWidth className={s.settingRow}>
                    <VStack gap={SPACING.s4}>
                        <Typo.SM size={14} color="primary">로그아웃</Typo.SM>
                        <Typo.MD size={12} color="secondary">현재 기기에서 로그아웃합니다</Typo.MD>
                    </VStack>
                    <button className={s.logoutButton} onClick={logout}>
                        로그아웃
                    </button>
                </HStack>
                <HStack justify="between" align="center" fullWidth className={s.settingRow}>
                    <VStack gap={SPACING.s4}>
                        <Typo.SM size={14} color="primary">계정 삭제</Typo.SM>
                        <Typo.MD size={12} color="secondary">모든 데이터가 영구적으로 삭제됩니다</Typo.MD>
                    </VStack>
                    {!showDeleteConfirm ? (
                        <button className={s.deleteButton} onClick={() => setShowDeleteConfirm(true)}>
                            회원탈퇴
                        </button>
                    ) : (
                        <HStack gap={SPACING.s8}>
                            <button className={s.cancelButton} onClick={() => setShowDeleteConfirm(false)}>
                                취소
                            </button>
                            <button className={s.deleteConfirmButton} onClick={async () => {
                                try {
                                    await deleteAccount();
                                    logout();
                                } catch (err: any) {
                                    alert(err.message ?? '계정 삭제에 실패했습니다.');
                                    setShowDeleteConfirm(false);
                                }
                            }}>
                                정말 삭제
                            </button>
                        </HStack>
                    )}
                </HStack>
            </VStack>
        </VStack>
    );
}
