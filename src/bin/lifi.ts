import { Command } from "commander";
import { registerAuthCommand } from "../commands/auth.js";
import { registerBalanceCommand } from "../commands/balance.js";
import { registerChainsCommand } from "../commands/chains.js";
import { registerConnectionsCommand } from "../commands/connections.js";
import { registerEarnCommand } from "../commands/earn.js";
import { registerGasCommand } from "../commands/gas.js";
import { registerHealthCommand } from "../commands/health.js";
import { registerIntentCommand } from "../commands/intent.js";
import { registerQuoteCommand } from "../commands/quote.js";
import { registerRoutesCommand } from "../commands/routes.js";
import { registerStatusCommand } from "../commands/status.js";
import { registerTokensCommand } from "../commands/tokens.js";
import { registerToolsCommand } from "../commands/tools.js";
import { handleError } from "../core/errors.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("lifi")
    .description("CLI for the LI.FI cross-chain bridge & DEX aggregation API")
    .version("0.1.0")
    .option("--json", "Output raw JSON instead of formatted tables")
    .option("--no-color", "Disable colored output")
    .option("--no-input", "Disable interactive prompts (for scripting)")
    .option("--verbose", "Show verbose output including full API responses")
    .addHelpText(
      "after",
      "\nDocs: https://docs.li.fi/api-reference/introduction\nRepo: https://github.com/lifinance/lifi-cli",
    );

  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts["color"] === false) {
      process.env["NO_COLOR"] = "1";
    }
    if (opts["verbose"]) {
      process.env["LIFI_VERBOSE"] = "1";
    }
    if (opts["input"] === false) {
      process.env["LIFI_NO_INPUT"] = "1";
    }
  });

  registerAuthCommand(program);
  registerChainsCommand(program);
  registerTokensCommand(program);
  registerQuoteCommand(program);
  registerIntentCommand(program);
  registerRoutesCommand(program);
  registerStatusCommand(program);
  registerConnectionsCommand(program);
  registerEarnCommand(program);
  registerToolsCommand(program);
  registerGasCommand(program);
  registerHealthCommand(program);
  registerBalanceCommand(program);

  return program;
}

if (process.env["VITEST"] === undefined) {
  const program = createProgram();
  program.parseAsync(process.argv).catch(handleError);
}
