import { SupportPanel } from '../../features/support/SupportPanel';
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
