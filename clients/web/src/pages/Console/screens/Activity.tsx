import { Screen, ScreenPlaceholder } from "./Screen";

export function Activity() {
  return (
    <Screen eyebrow="Live" title="Activity" subtitle="Every spend, claim, and score update across your fleet.">
      <ScreenPlaceholder note="Live activity feed lands in slice 4.W.8 (WebSocket stream)." />
    </Screen>
  );
}
