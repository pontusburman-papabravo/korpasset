import { readFileSync } from "node:fs";
import { closePool } from "../db/pool.js";
import { applyMigrations } from "../db/migrate.js";
import { BROADCAST_FROM, listBroadcastRecipients, sendBroadcast } from "../services/broadcast-email.js";

function argValue(name: string): string | undefined {
  const prefix = `--${name}`;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === prefix) return argv[i + 1];
    if (argv[i].startsWith(`${prefix}=`)) return argv[i].slice(prefix.length + 1);
  }
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

async function main(): Promise<void> {
  const subject = argValue("subject")?.trim() ?? "";
  const textFile = argValue("text-file");
  const send = hasFlag("send");
  if (!subject || !textFile) {
    console.log(
      [
        "Förhandsvisar eller skickar ett mejl till alla i systemet.",
        "Varje mottagare får ett eget mejl. Ingen annan adress står i till eller kopia.",
        "",
        "  npm run mail:broadcast -- --subject \"...\" --text-file ./brev.txt",
        "  npm run mail:broadcast -- --subject \"...\" --text-file ./brev.txt --send",
        "",
        "Utan --send skickas ingenting.",
      ].join("\n"),
    );
    return;
  }

  const text = readFileSync(textFile, "utf8").trim();
  if (!text) {
    console.error("Textfilen är tom. Inget skickades.");
    process.exitCode = 1;
    return;
  }

  await applyMigrations();
  const recipients = await listBroadcastRecipients();
  console.log(`från: ${BROADCAST_FROM}`);
  console.log(`ämne: ${subject}`);
  console.log(`mottagare: ${recipients.length}`);
  console.log("ett mejl per mottagare");

  if (!send) {
    console.log("skickat: nej");
    return;
  }

  const result = await sendBroadcast({ recipients, subject, text });
  console.log(`skickade: ${result.sent}`);
  console.log(`misslyckade: ${result.failed.length}`);
  if (result.failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "broadcast failed";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
