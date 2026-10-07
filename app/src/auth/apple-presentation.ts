/**
 * Which window Sign in with Apple may use as its presentation anchor.
 *
 * The iOS plugin applies the same rules: only a foreground-active scene,
 * never UIApplication.shared.windows.first, and no invented empty window.
 * A hidden key window is not a place the sheet can appear.
 */

export type SceneActivation =
  | "foregroundActive"
  | "foregroundInactive"
  | "background"
  | "unattached";

export interface PresentationWindow {
  id: string;
  isKeyWindow: boolean;
  isHidden: boolean;
}

export interface PresentationScene {
  activationState: SceneActivation;
  windows: PresentationWindow[];
}

export function selectApplePresentationWindow(
  scenes: readonly PresentationScene[],
): PresentationWindow | null {
  const windows = scenes
    .filter((scene) => scene.activationState === "foregroundActive")
    .flatMap((scene) => scene.windows);
  const key = windows.find((window) => window.isKeyWindow && !window.isHidden);
  if (key) return key;
  return windows.find((window) => !window.isHidden) ?? null;
}
