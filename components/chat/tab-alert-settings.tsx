import { notificationTypeOptions, type NotificationPreferences, type TabAlertPreferences } from "@/lib/tab-alerts";
import { PushAlertSettings } from "./push-alert-settings";

const options: Array<{ key: keyof TabAlertPreferences; title: string; detail: string }> = [
  { key: "direct", title: "Личные сообщения", detail: "Показывать отправителя нового личного сообщения" },
  { key: "mentions", title: "Упоминания", detail: "Показывать, кто упомянул вас в чате" },
  { key: "notifications", title: "Другие уведомления", detail: "Показывать новые события из центра уведомлений" },
];

export function TabAlertSettings({ value, onChange, notificationPreferences, onNotificationPreferencesChange, admin }: { value: TabAlertPreferences; onChange: (next: TabAlertPreferences) => void; notificationPreferences: NotificationPreferences; onNotificationPreferencesChange: (next: NotificationPreferences) => void; admin: boolean }) {
  return <section className="profile-settings-content profile-alert-settings">
    <p className="profile-section-lead">Здесь настраиваются три разные вещи: сигнал в заголовке вкладки, push на устройстве и события в разделе «Уведомления».</p>
    <div className="profile-settings-fields"><PushAlertSettings admin={admin} /><fieldset className="profile-tab-alerts">
    <legend>Оповещения во вкладке</legend>
    <p>Это мигание и текст в заголовке браузера. Настройки применяются сразу и сохраняются в этом браузере.</p>
    {options.map(({ key, title, detail }) => <label className="profile-tab-alert-option" key={key}>
      <input type="checkbox" checked={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} />
      <span><strong>{title}</strong><small>{detail}</small></span>
    </label>)}
    </fieldset>
    <fieldset className="profile-tab-alerts">
      <legend>Превью личных сообщений в списке людей</legend>
      <label className="profile-tab-alert-option">
        <input type="checkbox" checked={value.directPreview} onChange={(event) => onChange({ ...value, directPreview: event.target.checked })} />
        <span><strong>Показывать текст нового личного сообщения</strong><small>Превью появится рядом с отправителем в списке участников чата</small></span>
      </label>
    </fieldset>
    <fieldset className="profile-tab-alerts profile-notification-alerts">
      <legend>События в разделе «Уведомления»</legend>
      <p>Выберите, какие события попадут в колокольчик и на отдельную страницу «Уведомления». Настройки сохраняются в этом браузере.</p>
      <div className="profile-notification-options">{notificationTypeOptions.map(({ key, title, detail }) => <label className="profile-tab-alert-option" key={key}>
        <input type="checkbox" checked={notificationPreferences[key]} onChange={(event) => onNotificationPreferencesChange({ ...notificationPreferences, [key]: event.target.checked })} />
        <span><strong>{title}</strong><small>{detail}</small></span>
      </label>)}</div>
    </fieldset></div>
  </section>;
}
