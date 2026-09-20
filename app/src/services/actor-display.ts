export function actorDisplayName(
  displayName: string | null | undefined,
  accountState: string | null | undefined,
  role: "supervisor" | "student" = "supervisor",
): string {
  if (accountState === "deleted") {
    return role === "student" ? "Tidigare elev" : "Tidigare handledare";
  }
  const name = displayName?.trim();
  if (name) return name;
  return role === "student" ? "Elev" : "Handledare";
}
