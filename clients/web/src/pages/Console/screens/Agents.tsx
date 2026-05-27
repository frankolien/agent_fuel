import { Screen, ScreenPlaceholder } from "./Screen";

export function Agents() {
  return (
    <Screen eyebrow="Roster" title="Agents" subtitle="All agents under this organisation.">
      <ScreenPlaceholder note="Agents list + detail land in slice 4.W.6 (Agents UI)." />
    </Screen>
  );
}
