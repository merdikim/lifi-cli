import { input } from "@inquirer/prompts";
import { ExitCode } from "./constants.js";
import { CliError } from "./errors.js";

export async function promptIfMissing(value: string | undefined, label: string): Promise<string> {
  if (value) return value;
  if (process.env["LIFI_NO_INPUT"] === "1") {
    throw new CliError(
      `Missing required option: ${label}`,
      ExitCode.InvalidArgs,
      "Pass all required flags when using --no-input",
    );
  }
  return input({ message: `${label}:` });
}
