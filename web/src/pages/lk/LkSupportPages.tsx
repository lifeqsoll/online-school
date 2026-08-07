import { Tabs } from 'antd';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SupportPanel } from '../../features/support/SupportPanel';
import { useAuth } from '../../shared/auth/AuthContext';
import { useClearSupportBadge } from '../../shared/notifications/useClearSupportBadge';

export function LkCourseSupportPage() {
  useClearSupportBadge('COURSE');
  return (
    <SupportPanel
      mode="mine"
      channel="COURSE"
      title="Поддержка курса"
      allowCreate
    />
  );
}

export function LkTechSupportPage() {
  useClearSupportBadge('TECH');
  return (
    <SupportPanel
      mode="mine"
      channel="TECH"
      title="Техподдержка"
      allowCreate
    />
  );
}

export function StaffSupportInboxPage({
  channel,
  title,
}: {
  channel: 'COURSE' | 'TECH';
  title: string;
}) {
  useClearSupportBadge(channel === 'TECH' ? 'STAFF_TECH' : 'STAFF_COURSE');
  return (
    <SupportPanel
      mode="inbox"
      channel={channel}
      title={title}
      allowCreate={false}
    />
  );
}

/** Admin: TECH + COURSE inboxes with tabs */
export function AdminSupportInboxPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const initial = useMemo((): 'TECH' | 'COURSE' => {
    const c = params.get('channel');
    return c === 'COURSE' ? 'COURSE' : 'TECH';
  }, [params]);
  const [tab, setTab] = useState<'TECH' | 'COURSE'>(initial);
  useClearSupportBadge(tab === 'TECH' ? 'STAFF_TECH' : 'STAFF_COURSE');

  if (user?.globalRole !== 'ADMIN') {
    return <StaffSupportInboxPage channel="TECH" title="Техподдержка" />;
  }

  return (
    <div>
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as 'TECH' | 'COURSE')}
        items={[
          { key: 'TECH', label: 'Техподдержка' },
          { key: 'COURSE', label: 'Чаты с кураторами' },
        ]}
        style={{ marginBottom: 8 }}
      />
      <SupportPanel
        key={tab}
        mode="inbox"
        channel={tab}
        title={tab === 'TECH' ? 'Техподдержка' : 'Поддержка курса'}
        allowCreate={false}
      />
    </div>
  );
}
