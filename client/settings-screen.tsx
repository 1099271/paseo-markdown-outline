import { useSettings, useTranslation } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { outlinePreferences } from "../shared/preferences";
import { messages } from "./messages";

export function OutlineSettings() {
  const { t } = useTranslation(messages);
  const settings = useSettings(outlinePreferences);
  if (settings.status !== "ready") return null;
  const { values, revision } = settings;
  const save = (patch: Partial<typeof values>) => void settings.save({ ...values, ...patch }, revision);
  return (
    <SettingsSection title={t("settingsTitle")} info={t("deviceHint")}>
      <SettingsCard>
        <SettingsSelect
          label={t("side")}
          value={values.side}
          options={[
            { label: t("left"), value: "left" },
            { label: t("right"), value: "right" },
          ]}
          onValueChange={(side) => save({ side })}
        />
        <SettingsSelect
          label={t("width")}
          value={values.width}
          options={[
            { label: t("narrow"), value: "narrow" },
            { label: t("normal"), value: "normal" },
            { label: t("wide"), value: "wide" },
          ]}
          onValueChange={(width) => save({ width })}
        />
        <SettingsSwitch
          label={t("visible")}
          hint={t("visibleHint")}
          value={values.visible}
          onValueChange={(visible) => save({ visible })}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
