import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectApplePresentationWindow,
  type PresentationScene,
} from "../src/auth/apple-presentation.js";

function scene(
  activationState: PresentationScene["activationState"],
  windows: PresentationScene["windows"],
): PresentationScene {
  return { activationState, windows };
}

describe("Apple presentation window", () => {
  it("uses the visible key window in the foreground-active scene", () => {
    const chosen = selectApplePresentationWindow([
      scene("background", [{ id: "old-key", isKeyWindow: true, isHidden: false }]),
      scene("foregroundInactive", [{ id: "inactive-key", isKeyWindow: true, isHidden: false }]),
      scene("foregroundActive", [
        { id: "hidden-key", isKeyWindow: true, isHidden: true },
        { id: "visible-key", isKeyWindow: true, isHidden: false },
      ]),
    ]);
    assert.equal(chosen?.id, "visible-key");
  });

  it("does not treat the first window of the first scene as the anchor", () => {
    const chosen = selectApplePresentationWindow([
      scene("foregroundActive", [
        { id: "root", isKeyWindow: false, isHidden: false },
        { id: "key", isKeyWindow: true, isHidden: false },
      ]),
    ]);
    assert.equal(chosen?.id, "key");
  });

  it("uses a visible non-key window when the active scene has no key window", () => {
    const chosen = selectApplePresentationWindow([
      scene("foregroundActive", [
        { id: "hidden", isKeyWindow: false, isHidden: true },
        { id: "visible", isKeyWindow: false, isHidden: false },
      ]),
    ]);
    assert.equal(chosen?.id, "visible");
  });

  it("returns no window instead of inventing an anchor", () => {
    assert.equal(
      selectApplePresentationWindow([
        scene("foregroundInactive", [{ id: "inactive", isKeyWindow: true, isHidden: false }]),
        scene("foregroundActive", [{ id: "hidden-key", isKeyWindow: true, isHidden: true }]),
      ]),
      null,
    );
    assert.equal(selectApplePresentationWindow([]), null);
  });
});
