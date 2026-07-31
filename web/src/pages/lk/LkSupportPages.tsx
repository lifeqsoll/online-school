import { SupportPanel } from '../../features/support/SupportPanel';

export function LkCourseSupportPage() {
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
  return (
    <SupportPanel
      mode="inbox"
      channel={channel}
      title={title}
      allowCreate={false}
    />
  );
}
