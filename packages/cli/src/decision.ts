// One implementation is shared by the historical source entry and npm bundles.
// @ts-expect-error JavaScript research module is validated by its dedicated tests.
import { main } from "../../../experiments/decision-shadow/main.mjs";
export async function cmdDecision(argv: string[]): Promise<void> {
  await main(argv);
}
