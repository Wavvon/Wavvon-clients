import { useTranslation } from "react-i18next";
import type { BadgeDef } from "../../types";

export function useBadgeRuleLabel() {
  const { t } = useTranslation();
  return (def: Pick<BadgeDef, "rule" | "program_pubkey">, programName?: string) =>
    def.program_pubkey
      ? t("hub.admin.badges.rule.program", { name: programName ?? def.program_pubkey.slice(0, 8) })
      : t(`hub.admin.badges.rule.${def.rule}`);
}

export function BadgeRuleText({ def, programName }: { def: BadgeDef; programName?: string }) {
  const { t } = useTranslation();
  const label = useBadgeRuleLabel();
  return (
    <>
      <span>{label(def, programName)}</span>
      {!def.program_pubkey && def.rule !== "manual" && (
        <span className="muted"> · {t(def.keep_while ? "hub.admin.badges.keep.while" : "hub.admin.badges.keep.good")}</span>
      )}
      {def.program_pubkey && def.declared_rule && (
        <div className="muted badge-declared">
          <em>{def.declared_rule}</em> ({t("hub.admin.badges.declared_by")})
        </div>
      )}
    </>
  );
}
