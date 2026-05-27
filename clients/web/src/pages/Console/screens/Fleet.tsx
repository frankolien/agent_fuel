import { Screen, ScreenPlaceholder } from "./Screen";

export function Fleet() {
  return (
    <Screen
      eyebrow="Overview"
      title="Fleet"
      subtitle="KPIs, live activity, and the agents you operate."
    >
      <ScreenPlaceholder note="Fleet KPIs, agent cards, and the activity stream will land in slice 4.W.6." />
    </Screen>
  );
}
