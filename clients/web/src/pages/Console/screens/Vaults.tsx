import { Screen, ScreenPlaceholder } from "./Screen";

export function Vaults() {
  return (
    <Screen eyebrow="Treasury" title="Vaults" subtitle="USDC-funded credit vaults and policies.">
      <ScreenPlaceholder note="Vaults list + policy editor land in slice 4.W.7 (Vaults UI)." />
    </Screen>
  );
}
