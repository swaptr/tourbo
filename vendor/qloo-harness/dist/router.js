import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import {
  areEquivalentQlooBaseUrls,
  isOfficialQlooBaseUrl,
  parseQlooConfig,
  resolveQlooConfigPath
} from "./chunks/chunk-ESNY4EJL.js";
import {
  __commonJS,
  __require,
  __toESM
} from "./chunks/chunk-KTNGVO26.js";

// apps/qloo-cli/node_modules/commander/lib/error.js
var require_error = __commonJS({
  "apps/qloo-cli/node_modules/commander/lib/error.js"(exports) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
  }
});

// apps/qloo-cli/node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "apps/qloo-cli/node_modules/commander/lib/argument.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports.Argument = Argument2;
    exports.humanReadableArgName = humanReadableArgName;
  }
});

// apps/qloo-cli/node_modules/commander/lib/help.js
var require_help = __commonJS({
  "apps/qloo-cli/node_modules/commander/lib/help.js"(exports) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(max, helper.subcommandTerm(command).length);
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(max, helper.argumentTerm(argument).length);
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescripton = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescripton}`;
          }
          return extraDescripton;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth || 80;
        const itemIndentWidth = 2;
        const itemSeparatorWidth = 2;
        function formatItem(term, description) {
          if (description) {
            const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
            return helper.wrap(
              fullText,
              helpWidth - itemIndentWidth,
              termWidth + itemSeparatorWidth
            );
          }
          return term;
        }
        function formatList(textArray) {
          return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
        }
        let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.wrap(commandDescription, helpWidth, 0),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return formatItem(
            helper.argumentTerm(argument),
            helper.argumentDescription(argument)
          );
        });
        if (argumentList.length > 0) {
          output = output.concat(["Arguments:", formatList(argumentList), ""]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return formatItem(
            helper.optionTerm(option),
            helper.optionDescription(option)
          );
        });
        if (optionList.length > 0) {
          output = output.concat(["Options:", formatList(optionList), ""]);
        }
        if (this.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return formatItem(
              helper.optionTerm(option),
              helper.optionDescription(option)
            );
          });
          if (globalOptionList.length > 0) {
            output = output.concat([
              "Global Options:",
              formatList(globalOptionList),
              ""
            ]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return formatItem(
            helper.subcommandTerm(cmd2),
            helper.subcommandDescription(cmd2)
          );
        });
        if (commandList.length > 0) {
          output = output.concat(["Commands:", formatList(commandList), ""]);
        }
        return output.join("\n");
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Wrap the given string to width characters per line, with lines after the first indented.
       * Do not wrap if insufficient room for wrapping (minColumnWidth), or string is manually formatted.
       *
       * @param {string} str
       * @param {number} width
       * @param {number} indent
       * @param {number} [minColumnWidth=40]
       * @return {string}
       *
       */
      wrap(str, width, indent, minColumnWidth = 40) {
        const indents = " \\f\\t\\v\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF";
        const manualIndent = new RegExp(`[\\n][${indents}]+`);
        if (str.match(manualIndent)) return str;
        const columnWidth = width - indent;
        if (columnWidth < minColumnWidth) return str;
        const leadingStr = str.slice(0, indent);
        const columnText = str.slice(indent).replace("\r\n", "\n");
        const indentString = " ".repeat(indent);
        const zeroWidthSpace = "\u200B";
        const breaks = `\\s${zeroWidthSpace}`;
        const regex = new RegExp(
          `
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`,
          "g"
        );
        const lines = columnText.match(regex) || [];
        return leadingStr + lines.map((line, i) => {
          if (line === "\n") return "";
          return (i > 0 ? indentString : "") + line.trimEnd();
        }).join("\n");
      }
    };
    exports.Help = Help2;
  }
});

// apps/qloo-cli/node_modules/commander/lib/option.js
var require_option = __commonJS({
  "apps/qloo-cli/node_modules/commander/lib/option.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as a object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const flagParts = flags.split(/[ |,]+/);
      if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
        shortFlag = flagParts.shift();
      longFlag = flagParts.shift();
      if (!shortFlag && /^-[^-]$/.test(longFlag)) {
        shortFlag = longFlag;
        longFlag = void 0;
      }
      return { shortFlag, longFlag };
    }
    exports.Option = Option2;
    exports.DualOptions = DualOptions;
  }
});

// apps/qloo-cli/node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "apps/qloo-cli/node_modules/commander/lib/suggestSimilar.js"(exports) {
    var maxDistance = 3;
    function editDistance2(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance2(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports.suggestSimilar = suggestSimilar;
  }
});

// apps/qloo-cli/node_modules/commander/lib/command.js
var require_command = __commonJS({
  "apps/qloo-cli/node_modules/commander/lib/command.js"(exports) {
    var EventEmitter = __require("node:events").EventEmitter;
    var childProcess = __require("node:child_process");
    var path = __require("node:path");
    var fs = __require("node:fs");
    var process2 = __require("node:process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = true;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._outputConfiguration = {
          writeOut: (str) => process2.stdout.write(str),
          writeErr: (str) => process2.stderr.write(str),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          outputError: (str, write) => write(str)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // functions to change where being written, stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // matching functions to specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // functions based on what is being written out
       *     outputError(str, write) // used for displaying errors, and not used for displaying help
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          return this;
        }
        enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('-p, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process2.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process2.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process2.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path.resolve(baseDir, baseName);
          if (fs.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs.realpathSync(this._scriptPath);
          } catch (err) {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path.resolve(
            path.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path.basename(
              this._scriptPath,
              path.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process2.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
            const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
            throw new Error(executableMissing);
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} argv
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg);
              if (args.length > 0) operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0) dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0) return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str) {
        if (str === void 0) return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str) {
        if (str === void 0) return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path.basename(filename, path.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path2) {
        if (path2 === void 0) return this._executableDir;
        this._executableDir = path2;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        if (helper.helpWidth === void 0) {
          helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
        }
        return helper.formatHelp(this, helper);
      }
      /**
       * @private
       */
      _getHelpContext(contextOptions) {
        contextOptions = contextOptions || {};
        const context = { error: !!contextOptions.error };
        let write;
        if (context.error) {
          write = (arg) => this._outputConfiguration.writeErr(arg);
        } else {
          write = (arg) => this._outputConfiguration.writeOut(arg);
        }
        context.write = contextOptions.write || write;
        context.command = this;
        return context;
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const context = this._getHelpContext(contextOptions);
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
        this.emit("beforeHelp", context);
        let helpInformation = this.helpInformation(context);
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        context.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", context);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", context)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            this._helpOption = this._helpOption ?? void 0;
          } else {
            this._helpOption = null;
          }
          return this;
        }
        flags = flags ?? "-h, --help";
        description = description ?? "display help for command";
        this._helpOption = this.createOption(flags, description);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = process2.exitCode || 0;
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    exports.Command = Command2;
  }
});

// apps/qloo-cli/node_modules/commander/index.js
var require_commander = __commonJS({
  "apps/qloo-cli/node_modules/commander/index.js"(exports) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports.program = new Command2();
    exports.createCommand = (name) => new Command2(name);
    exports.createOption = (flags, description) => new Option2(flags, description);
    exports.createArgument = (name, description) => new Argument2(name, description);
    exports.Command = Command2;
    exports.Option = Option2;
    exports.Argument = Argument2;
    exports.Help = Help2;
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
    exports.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// apps/qloo-cli/node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// apps/qloo-cli/dist/color.js
var RESET = "\x1B[0m";
var BOLD = "\x1B[1m";
var YELLOW = "\x1B[33m";
var flagDisabled = false;
var setColorDisabled = (disabled) => {
  flagDisabled = disabled;
};
var isColorEnabled = () => !flagDisabled && !("NO_COLOR" in process.env);
var wrap = (code, text) => isColorEnabled() ? `${code}${text}${RESET}` : text;
var bold = (text) => wrap(BOLD, text);
var yellow = (text) => wrap(YELLOW, text);

// apps/qloo-cli/dist/log.js
import { AsyncLocalStorage } from "node:async_hooks";
var defaultContext = {
  verbosity: "normal",
  writeErr: (value) => process.stderr.write(value)
};
var contexts = new AsyncLocalStorage();
var getContext = () => contexts.getStore() ?? defaultContext;
var withLogContext = (writeErr, callback) => contexts.run({ verbosity: "normal", writeErr }, callback);
var setVerbosity = (verbose2, quiet) => {
  const context = getContext();
  if (quiet) {
    context.verbosity = "quiet";
  } else if (verbose2) {
    context.verbosity = "verbose";
  } else {
    context.verbosity = "normal";
  }
};
var info = (msg) => {
  const context = getContext();
  if (context.verbosity !== "quiet") {
    context.writeErr(`${msg}
`);
  }
};
var warn = (msg) => {
  const context = getContext();
  if (context.verbosity !== "quiet") {
    context.writeErr(`${yellow(`Warning: ${msg}`)}
`);
  }
};
var verbose = (msg) => {
  const context = getContext();
  if (context.verbosity === "verbose") {
    context.writeErr(`${msg}
`);
  }
};

// apps/qloo-cli/dist/api.js
var DEFAULT_BASE_URL = "https://api.qloo.com";
var QlooApiClient = class {
  apiKey;
  baseUrl;
  constructor(options) {
    this.apiKey = options.apiKey;
    const configuredBaseUrl = options.baseUrl || DEFAULT_BASE_URL;
    let parsedBaseUrl;
    try {
      parsedBaseUrl = new URL(configuredBaseUrl);
    } catch {
      throw new Error("Qloo base URL is invalid.");
    }
    const isLoopback = parsedBaseUrl.hostname === "localhost" || parsedBaseUrl.hostname === "127.0.0.1" || parsedBaseUrl.hostname === "[::1]";
    if (parsedBaseUrl.protocol !== "https:" && !(parsedBaseUrl.protocol === "http:" && isLoopback)) {
      throw new Error("Qloo base URL must use HTTPS (HTTP is allowed only for a loopback test server).");
    }
    if (parsedBaseUrl.username || parsedBaseUrl.password || parsedBaseUrl.search || parsedBaseUrl.hash) {
      throw new Error("Qloo base URL cannot contain credentials, query parameters, or a fragment.");
    }
    parsedBaseUrl.pathname = parsedBaseUrl.pathname.replace(/\/+$/, "") + "/";
    this.baseUrl = parsedBaseUrl.toString();
    if (!isOfficialQlooBaseUrl(this.baseUrl) && !options.allowCustomBaseUrl) {
      throw new Error("Custom Qloo base URL is not trusted. Use `qloo config set base-url <url>` or set QLOO_TRUSTED_BASE_URL to the exact endpoint.");
    }
  }
  async request(endpoint, params = {}) {
    const url = new URL(endpoint, this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        url.searchParams.set(key, value.join(","));
      } else if (value !== void 0 && value !== "") {
        url.searchParams.set(key, value);
      }
    }
    const fullUrl = url.toString();
    verbose(`API request: GET ${fullUrl}`);
    const startTime = performance.now();
    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        "X-Api-Key": this.apiKey,
        Accept: "application/json"
      }
    });
    const elapsed = performance.now() - startTime;
    verbose(`Response: ${response.status} in ${elapsed.toFixed(0)}ms`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
  /**
   * Get taste-based insights
   */
  async getInsights(params) {
    return this.request("/v2/insights", params);
  }
  /**
   * Search for entities by name
   */
  async searchEntities(params) {
    return this.request("/search", params);
  }
  /**
   * Get entities by IDs
   */
  async getEntities(entityIds) {
    return this.request("/entities", {
      entity_ids: entityIds
    });
  }
  /**
   * Analyze and compare two groups of entities
   */
  async analyzeCompare(params) {
    return this.request("/v2/analysis/compare", params);
  }
  /**
   * Search for tags
   */
  async searchTags(params) {
    return this.request("/v2/tags", params);
  }
};

// apps/qloo-cli/dist/output.js
function formatEntities(entities, options) {
  if (options.format === "json") {
    return JSON.stringify(entities, null, 2);
  }
  if (options.format === "plain") {
    const header2 = ["name", "type", "entity_id", "affinity", "popularity"].join("	");
    const rows2 = entities.map((e) => {
      const affinityVal = e.affinity ?? e.query?.affinity;
      return [
        e.name || "",
        (e.subtype || e.type || "").replace("urn:entity:", ""),
        e.entity_id || "",
        affinityVal?.toFixed(4) || "",
        e.popularity?.toFixed(4) || ""
      ].join("	");
    });
    return [header2, ...rows2].join("\n");
  }
  if (entities.length === 0) {
    return "No results found.";
  }
  const maxNameLen = Math.min(40, Math.max(4, ...entities.map((e) => (e.name || "").length)));
  const maxTypeLen = Math.min(20, Math.max(4, ...entities.map((e) => (e.type || "").length)));
  const headerPlain = `${"Name".padEnd(maxNameLen)}  ${"Type".padEnd(maxTypeLen)}  ${"Affinity".padEnd(10)}  ${"Popularity".padEnd(10)}`;
  const header = bold(headerPlain);
  const separator = "-".repeat(headerPlain.length);
  const rows = entities.map((e) => {
    const name = (e.name || "").slice(0, maxNameLen).padEnd(maxNameLen);
    const rawType = e.subtype || e.type || "";
    const type = rawType.replace("urn:entity:", "").slice(0, maxTypeLen).padEnd(maxTypeLen);
    const affinityVal = e.affinity ?? e.query?.affinity;
    const affinity = affinityVal !== void 0 ? affinityVal.toFixed(4) : "-";
    const popularity = e.popularity !== void 0 ? e.popularity.toFixed(4) : "-";
    return `${name}  ${type.padEnd(maxTypeLen)}  ${affinity.padStart(10)}  ${popularity.padStart(10)}`;
  });
  return [header, separator, ...rows].join("\n");
}
function formatEntityDetail(entity, options) {
  if (options.format === "json") {
    return JSON.stringify(entity, null, 2);
  }
  if (options.format === "plain") {
    return Object.entries(entity).filter(([, v]) => v !== void 0 && v !== null).map(([k, v]) => `${k}	${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n");
  }
  const lines = [];
  lines.push(`Name:        ${entity.name || "Unknown"}`);
  lines.push(`Type:        ${(entity.type || "").replace("urn:entity:", "")}`);
  lines.push(`Entity ID:   ${entity.entity_id}`);
  if (entity.description) {
    lines.push(`Description: ${entity.description}`);
  }
  if (entity.popularity !== void 0) {
    lines.push(`Popularity:  ${entity.popularity.toFixed(4)}`);
  }
  if (entity.image_url) {
    lines.push(`Image:       ${entity.image_url}`);
  }
  if (entity.address?.formatted) {
    lines.push(`Address:     ${entity.address.formatted}`);
  }
  if (entity.tags && entity.tags.length > 0) {
    const tagNames = entity.tags.slice(0, 10).map((t) => t.name).join(", ");
    lines.push(`Tags:        ${tagNames}`);
  }
  if (entity.external) {
    const externalIds = Object.entries(entity.external).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).slice(0, 5).join(", ");
    if (externalIds) {
      lines.push(`External:    ${externalIds}`);
    }
  }
  return lines.join("\n");
}
function formatAnalysis(result, options) {
  if (options.format === "json") {
    return JSON.stringify(result, null, 2);
  }
  const entities = result.results?.entities || [];
  const tags = result.results?.tags || [];
  if (options.format === "plain") {
    if (tags.length > 0) {
      const header = ["name", "type", "tag_id"].join("	");
      const rows = tags.map((t) => [t.name || "", t.type || "", t.tag_id || ""].join("	"));
      return [header, ...rows].join("\n");
    }
    return formatEntities(entities, options);
  }
  const lines = [];
  if (tags.length > 0) {
    lines.push(bold("Differentiating Tags:"));
    lines.push("-".repeat(60));
    const maxNameLen = Math.min(30, Math.max(4, ...tags.map((t) => (t.name || "").length)));
    for (const tag of tags.slice(0, 20)) {
      const name = (tag.name || "").slice(0, maxNameLen).padEnd(maxNameLen);
      const type = (tag.type || "").replace("urn:tag:", "");
      lines.push(`${name}  ${type}`);
    }
  }
  if (entities.length > 0) {
    if (lines.length > 0)
      lines.push("");
    lines.push(bold("Differentiating Entities:"));
    lines.push("-".repeat(60));
    lines.push(formatEntities(entities, { format: "table" }));
  }
  if (lines.length === 0) {
    return "No differentiating attributes found.";
  }
  return lines.join("\n");
}
function formatTags(tags, options) {
  if (options.format === "json") {
    return JSON.stringify(tags, null, 2);
  }
  if (options.format === "plain") {
    const header2 = ["name", "type", "tag_id"].join("	");
    const rows2 = tags.map((t) => [t.name || "", t.type || "", t.tag_id || ""].join("	"));
    return [header2, ...rows2].join("\n");
  }
  if (tags.length === 0) {
    return "No tags found.";
  }
  const maxNameLen = Math.min(30, Math.max(4, ...tags.map((t) => (t.name || "").length)));
  const maxTypeLen = Math.min(20, Math.max(4, ...tags.map((t) => (t.type || "").length)));
  const headerPlain = `${"Name".padEnd(maxNameLen)}  ${"Type".padEnd(maxTypeLen)}  Tag ID`;
  const header = bold(headerPlain);
  const separator = "-".repeat(80);
  const rows = tags.map((t) => {
    const name = (t.name || "").slice(0, maxNameLen).padEnd(maxNameLen);
    const type = (t.type || "").replace("urn:tag:", "").slice(0, maxTypeLen).padEnd(maxTypeLen);
    return `${name}  ${type}  ${t.tag_id || ""}`;
  });
  return [header, separator, ...rows].join("\n");
}

// apps/qloo-cli/dist/config.js
import { chmodSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
function loadConfig(configPath = getConfigPath()) {
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    return parseQlooConfig(readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}
function getConfigPath(env = process.env) {
  return resolveQlooConfigPath({ env });
}
function configDirExists(configPath = getConfigPath()) {
  return existsSync(dirname(configPath));
}
function saveConfigValue(key, value, configPath = getConfigPath()) {
  const config = loadConfig(configPath);
  config[key] = value;
  saveConfig(config, configPath);
}
function deleteConfigValue(key, configPath = getConfigPath()) {
  const config = loadConfig(configPath);
  delete config[key];
  saveConfig(config, configPath);
}
function saveConfig(config, configPath) {
  const dir = dirname(configPath);
  let createdDirectory = false;
  if (!existsSync(dir)) {
    createdDirectory = mkdirSync(dir, { recursive: true, mode: 448 }) !== void 0;
  }
  if (createdDirectory && process.platform !== "win32") {
    chmodSync(dir, 448);
  }
  const lines = [];
  if (config.api_key)
    lines.push(`api_key=${config.api_key}`);
  if (config.base_url)
    lines.push(`base_url=${config.base_url}`);
  if (config.trusted_base_url)
    lines.push(`trusted_base_url=${config.trusted_base_url}`);
  if (config.taste_resolver_url)
    lines.push(`taste_resolver_url=${config.taste_resolver_url}`);
  writeFileSync(configPath, lines.join("\n") + "\n", { encoding: "utf-8", mode: 384 });
  if (process.platform !== "win32")
    chmodSync(configPath, 384);
}

// apps/qloo-cli/dist/errors.js
var EXIT_SUCCESS = 0;
var EXIT_GENERAL = 1;
var EXIT_BAD_USAGE = 2;
var EXIT_AUTH = 3;
var EXIT_NOT_FOUND = 4;
var EXIT_API = 5;
var EXIT_CONFIG = 6;
var EXIT_CODE_TO_ERROR_CODE = {
  [EXIT_SUCCESS]: "OK",
  [EXIT_GENERAL]: "GENERAL_ERROR",
  [EXIT_BAD_USAGE]: "BAD_USAGE",
  [EXIT_AUTH]: "AUTH_FAILED",
  [EXIT_NOT_FOUND]: "NOT_FOUND",
  [EXIT_API]: "API_ERROR",
  [EXIT_CONFIG]: "CONFIG_ERROR"
};
var toErrorCode = (exitCode) => EXIT_CODE_TO_ERROR_CODE[exitCode] ?? "GENERAL_ERROR";
var formatStructuredError = (code, message) => ({
  error: true,
  code,
  message
});
var CliExitError = class extends Error {
  exitCode;
  jsonMode;
  constructor(exitCode, message, jsonMode) {
    super(message);
    this.name = "CliExitError";
    this.exitCode = exitCode;
    this.jsonMode = jsonMode;
  }
  toStructuredError() {
    return formatStructuredError(toErrorCode(this.exitCode), this.message);
  }
};
var failWith = (exitCode, message, jsonMode) => {
  throw new CliExitError(exitCode, message, jsonMode);
};

// apps/qloo-cli/dist/completions.js
var SUBCOMMANDS = [
  "insights",
  "recommend",
  "search",
  "entity",
  "analyze",
  "tags",
  "types",
  "config",
  "completions"
];
var COMMON_FLAGS = [
  "--json",
  "--plain",
  "--type",
  "--take",
  "--api-key"
];
var TYPE_ALIASES = [
  "movie",
  "tv",
  "book",
  "brand",
  "music",
  "restaurant",
  "place",
  "person"
];
var CONFIG_ACTIONS = ["get", "set", "unset"];
var CONFIG_KEYS = ["api-key", "base-url", "taste-resolver-url"];
var generateBash = () => `# bash completion for qloo
# Add to ~/.bashrc or ~/.bash_profile:
#   eval "$(qloo completions bash)"

_qloo_completions() {
    local cur prev words cword
    _init_completion || return

    local subcommands="${SUBCOMMANDS.join(" ")}"
    local common_flags="${COMMON_FLAGS.join(" ")}"
    local type_aliases="${TYPE_ALIASES.join(" ")}"
    local config_actions="${CONFIG_ACTIONS.join(" ")}"
    local config_keys="${CONFIG_KEYS.join(" ")}"

    # Complete subcommands at position 1
    if [[ \${cword} -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "\${subcommands}" -- "\${cur}") )
        return
    fi

    local subcmd="\${words[1]}"

    # Complete --type values
    if [[ "\${prev}" == "--type" ]]; then
        COMPREPLY=( $(compgen -W "\${type_aliases}" -- "\${cur}") )
        return
    fi

    # Config subcommand completions
    if [[ "\${subcmd}" == "config" ]]; then
        if [[ \${cword} -eq 2 ]]; then
            COMPREPLY=( $(compgen -W "\${config_actions}" -- "\${cur}") )
            return
        fi
        if [[ \${cword} -eq 3 ]]; then
            COMPREPLY=( $(compgen -W "\${config_keys}" -- "\${cur}") )
            return
        fi
        return
    fi

    # Completions subcommand
    if [[ "\${subcmd}" == "completions" ]]; then
        if [[ \${cword} -eq 2 ]]; then
            COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
            return
        fi
        return
    fi

    # Flag completions for all other subcommands
    if [[ "\${cur}" == -* ]]; then
        COMPREPLY=( $(compgen -W "\${common_flags}" -- "\${cur}") )
        return
    fi
}

complete -F _qloo_completions qloo`;
var generateZsh = () => `# zsh completion for qloo
# Add to ~/.zshrc:
#   eval "$(qloo completions zsh)"

_qloo() {
    local -a subcommands common_flags type_aliases config_actions config_keys

    subcommands=(
${SUBCOMMANDS.map((s) => `        '${s}:${describeSubcommand(s)}'`).join("\n")}
    )

    common_flags=(
        '--json[Output as JSON]'
        '--plain[Output as TSV]'
        '--type[Entity type URN or alias]:type:(${TYPE_ALIASES.join(" ")})'
        '--take[Number of results to return]:count'
        '--api-key[Qloo API key]:key'
    )

    config_actions=(${CONFIG_ACTIONS.join(" ")})
    config_keys=(${CONFIG_KEYS.join(" ")})

    if (( CURRENT == 2 )); then
        _describe -t commands 'qloo command' subcommands
        return
    fi

    local subcmd=\${words[2]}

    case "\${subcmd}" in
        config)
            if (( CURRENT == 3 )); then
                _describe -t actions 'config action' '(get:"Show configuration values" set:"Set a configuration value" unset:"Remove a configuration value")'
                return
            fi
            if (( CURRENT == 4 )); then
                _values 'config key' \${config_keys}
                return
            fi
            ;;
        completions)
            if (( CURRENT == 3 )); then
                _values 'shell' bash zsh fish
                return
            fi
            ;;
        *)
            _arguments -s \${common_flags}
            ;;
    esac
}

compdef _qloo qloo`;
var generateFish = () => `# fish completion for qloo
# Add to ~/.config/fish/completions/qloo.fish:
#   qloo completions fish > ~/.config/fish/completions/qloo.fish

# Disable file completions by default
complete -c qloo -f

# Subcommands
${SUBCOMMANDS.map((s) => `complete -c qloo -n "__fish_use_subcommand" -a "${s}" -d "${describeSubcommand(s)}"`).join("\n")}

# Common flags (available for most subcommands)
${["insights", "recommend", "search", "entity", "analyze", "tags", "types"].map((sub) => `complete -c qloo -n "__fish_seen_subcommand_from ${sub}" -l json -d "Output as JSON"
complete -c qloo -n "__fish_seen_subcommand_from ${sub}" -l plain -d "Output as TSV"
complete -c qloo -n "__fish_seen_subcommand_from ${sub}" -l type -d "Entity type" -r -a "${TYPE_ALIASES.join(" ")}"
complete -c qloo -n "__fish_seen_subcommand_from ${sub}" -l take -d "Number of results" -r
complete -c qloo -n "__fish_seen_subcommand_from ${sub}" -l api-key -d "Qloo API key" -r`).join("\n")}

# Config action completions
complete -c qloo -n "__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from ${CONFIG_ACTIONS.join(" ")}" -a "${CONFIG_ACTIONS.join(" ")}"

# Config key completions
complete -c qloo -n "__fish_seen_subcommand_from config; and __fish_seen_subcommand_from ${CONFIG_ACTIONS.join(" ")}" -a "${CONFIG_KEYS.join(" ")}"

# Completions shell argument
complete -c qloo -n "__fish_seen_subcommand_from completions" -a "bash zsh fish"`;
var describeSubcommand = (cmd) => {
  const descriptions = {
    insights: "Get taste-based insights and recommendations",
    recommend: "Get recommendations from natural language",
    search: "Search for entities by name",
    entity: "Get detailed information about an entity",
    analyze: "Analyze and compare two groups of entities",
    tags: "Search and browse Qloo tags",
    types: "List all available entity types",
    config: "Manage Qloo CLI configuration",
    completions: "Generate shell completion scripts"
  };
  return descriptions[cmd] ?? cmd;
};
var SUPPORTED_SHELLS = ["bash", "zsh", "fish"];
var generators = {
  bash: generateBash,
  zsh: generateZsh,
  fish: generateFish
};
var isValidShell = (shell) => SUPPORTED_SHELLS.includes(shell);
var generateCompletion = (shell) => isValidShell(shell) ? { ok: true, script: generators[shell]() } : {
  ok: false,
  error: `Unsupported shell: ${shell}. Supported shells: ${SUPPORTED_SHELLS.join(", ")}`
};

// apps/qloo-cli/dist/validate.js
var FORBIDDEN_ID_CHARS = /[?#%]/;
var CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
var validateResourceId = (id, fieldName, jsonMode) => {
  const trimmed = id.trim();
  if (!trimmed) {
    return failWith(EXIT_BAD_USAGE, `${fieldName} must not be empty.`, jsonMode);
  }
  if (FORBIDDEN_ID_CHARS.test(trimmed)) {
    return failWith(EXIT_BAD_USAGE, `${fieldName} contains invalid characters (?, #, or %). Entity IDs are UUIDs \u2014 do not embed query parameters or URL fragments. Got: "${trimmed}"`, jsonMode);
  }
  if (CONTROL_CHARS.test(trimmed)) {
    return failWith(EXIT_BAD_USAGE, `${fieldName} contains control characters. Got: "${trimmed}"`, jsonMode);
  }
  return trimmed;
};
var validateResourceIds = (ids, fieldName, jsonMode) => {
  const parts = ids.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return failWith(EXIT_BAD_USAGE, `${fieldName} must not be empty.`, jsonMode);
  }
  parts.forEach((id) => validateResourceId(id, fieldName, jsonMode));
  return parts.join(",");
};
var rejectControlChars = (input, fieldName, jsonMode) => {
  if (CONTROL_CHARS.test(input)) {
    return failWith(EXIT_BAD_USAGE, `${fieldName} contains control characters, which are not allowed.`, jsonMode);
  }
  return input;
};
var safeParseJson = (input, fieldName, jsonMode) => {
  try {
    const parsed = JSON.parse(input);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return failWith(EXIT_BAD_USAGE, `${fieldName} must be a JSON object (e.g. '{"key": "value"}'). Got: ${typeof parsed}`, jsonMode);
    }
    return parsed;
  } catch {
    return failWith(EXIT_BAD_USAGE, `${fieldName} is not valid JSON. Got: "${input.slice(0, 100)}"`, jsonMode);
  }
};

// apps/qloo-cli/dist/mcp.js
import { createInterface } from "node:readline";

// apps/qloo-cli/dist/qloo-workflow-contract.json
var qloo_workflow_contract_default = {
  manifest_schema_version: "1.1",
  contract_version: "1.0.0",
  capabilities_tool: "qloo_capabilities",
  result_schema_version: "1.0-preview.1",
  result_schema: {
    type: "object",
    required: [
      "schema_version",
      "operation",
      "status",
      "execution"
    ],
    properties: {
      schema_version: {
        type: "string",
        const: "1.0-preview.1"
      },
      operation: {
        type: "string"
      },
      status: {
        anyOf: [
          {
            type: "string",
            const: "ok"
          },
          {
            type: "string",
            const: "empty"
          },
          {
            type: "string",
            const: "needs_input"
          },
          {
            type: "string",
            const: "partial"
          },
          {
            type: "string",
            const: "degraded"
          },
          {
            type: "string",
            const: "error"
          }
        ]
      },
      summary: {
        type: "string"
      },
      interpretation: {},
      results: {},
      result_count: {
        type: "integer",
        minimum: 0
      },
      warnings: {
        type: "array",
        items: {
          type: "string"
        }
      },
      query_intent: {},
      error: {
        type: "object",
        required: [
          "code",
          "layer",
          "retryable",
          "recovery"
        ],
        properties: {
          code: {
            type: "string"
          },
          layer: {
            type: "string"
          },
          retryable: {
            type: "boolean"
          },
          recovery: {
            type: "string"
          }
        },
        additionalProperties: false
      },
      execution: {
        type: "object",
        required: [
          "transport",
          "transport_name",
          "correlation_id",
          "duration_ms"
        ],
        properties: {
          transport: {
            type: "string",
            enum: [
              "direct",
              "cli",
              "mcp"
            ]
          },
          transport_name: {
            type: "string"
          },
          correlation_id: {
            type: "string"
          },
          duration_ms: {
            type: "number",
            minimum: 0
          }
        },
        additionalProperties: false
      },
      provenance: {
        type: "object",
        required: [
          "source",
          "endpoint",
          "documentation"
        ],
        properties: {
          source: {
            type: "string"
          },
          endpoint: {
            type: "string"
          },
          documentation: {
            type: "string"
          },
          transport: {
            type: "string"
          },
          requests: {
            type: "array",
            items: {
              type: "object",
              required: [
                "method",
                "path",
                "query"
              ],
              properties: {
                method: {
                  type: "string",
                  const: "GET"
                },
                path: {
                  type: "string",
                  minLength: 1
                },
                query: {}
              },
              additionalProperties: false
            },
            maxItems: 20
          }
        },
        additionalProperties: false
      }
    },
    additionalProperties: true
  },
  operations: [
    {
      id: "recommend",
      shared_tool_name: "qloo_recommend",
      summary: "Find entities for a taste profile, audience, or collection of signals.",
      description: "Find Qloo entities related to one combined entity, tag, location, and demographic taste profile. Signals influence affinity; filters constrain output.",
      input_schema: {
        type: "object",
        required: [
          "target_type"
        ],
        properties: {
          target_type: {
            type: "string",
            enum: [
              "artist",
              "book",
              "brand",
              "movie",
              "person",
              "place",
              "podcast",
              "tv_show",
              "videogame"
            ],
            description: "Qloo Insights entity type: artist, book, brand, movie, person, place, podcast, tv_show, videogame."
          },
          signals: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            },
            minItems: 1,
            maxItems: 10,
            description: "Named entities or Qloo entity UUIDs; use tag fields for abstract concepts."
          },
          signal_tags: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            },
            minItems: 1,
            maxItems: 10,
            description: "Genres, moods, styles, traits, or other concepts, or Qloo tag URNs; not named entities."
          },
          signal_tags_operator: {
            type: "string",
            enum: [
              "union",
              "intersection"
            ],
            description: "Combine tag values with union (any) or intersection (all)."
          },
          signal_location: {
            type: "string",
            minLength: 1
          },
          demographic: {
            type: "string",
            minLength: 1,
            description: "Audience demographic in natural language, such as 'young women', 'men 25-34', or 'millennials'. It is converted to documented Qloo demographic signals.",
            examples: [
              "young women",
              "men 25-34",
              "millennials"
            ]
          },
          filter_location: {
            type: "string",
            minLength: 1
          },
          include_tags: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            },
            minItems: 1,
            maxItems: 10,
            description: "Genres, moods, styles, traits, or other concepts, or Qloo tag URNs; not named entities."
          },
          include_tags_operator: {
            type: "string",
            enum: [
              "union",
              "intersection"
            ],
            description: "Combine tag values with union (any) or intersection (all)."
          },
          exclude_tags: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            },
            minItems: 1,
            maxItems: 10,
            description: "Genres, moods, styles, traits, or other concepts, or Qloo tag URNs; not named entities."
          },
          exclude_tags_operator: {
            type: "string",
            enum: [
              "union",
              "intersection"
            ],
            description: "Combine tag values with union (any) or intersection (all)."
          },
          explain: {
            type: "boolean",
            default: true
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 10,
            description: "Maximum results to return (1-20)."
          }
        },
        additionalProperties: false
      },
      behavior: {
        readOnly: true,
        idempotent: true,
        mutating: false,
        destructive: false,
        openWorld: true,
        concurrency: "safe_for_independent_inputs",
        requiredCredential: "qloo_api",
        defaultResultBudget: 10,
        maximumResultBudget: 20,
        safeRetryClasses: [
          "dns",
          "connect",
          "timeout",
          "rate_limit",
          "upstream_5xx"
        ],
        supportedTransports: [
          "direct",
          "mcp"
        ],
        expectedLatency: "medium"
      },
      documentation: [
        "https://docs.qloo.com/reference/insights-api-deep-dive"
      ]
    },
    {
      id: "rank",
      shared_tool_name: "qloo_rank",
      summary: "Rank a supplied set of options for signals, location, or audience.",
      description: "Rank one supplied option set against one shared entity, location, demographic, and tag profile. Scores from separate calls are not comparable.",
      input_schema: {
        type: "object",
        required: [
          "options",
          "option_type"
        ],
        properties: {
          options: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            },
            minItems: 1,
            maxItems: 10,
            description: "Named entities or Qloo entity UUIDs; use tag fields for abstract concepts."
          },
          option_type: {
            type: "string",
            enum: [
              "artist",
              "book",
              "brand",
              "movie",
              "person",
              "place",
              "podcast",
              "tv_show",
              "videogame"
            ],
            description: "Qloo Insights entity type: artist, book, brand, movie, person, place, podcast, tv_show, videogame."
          },
          signals: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            },
            minItems: 1,
            maxItems: 10,
            description: "Named entities or Qloo entity UUIDs; use tag fields for abstract concepts."
          },
          signal_location: {
            type: "string",
            minLength: 1
          },
          demographic: {
            type: "string",
            minLength: 1,
            description: "Audience demographic in natural language, such as 'young women', 'men 25-34', or 'millennials'. It is converted to documented Qloo demographic signals.",
            examples: [
              "young women",
              "men 25-34",
              "millennials"
            ]
          },
          include_tags: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            },
            minItems: 1,
            maxItems: 10,
            description: "Genres, moods, styles, traits, or other concepts, or Qloo tag URNs; not named entities."
          },
          exclude_tags: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            },
            minItems: 1,
            maxItems: 10,
            description: "Genres, moods, styles, traits, or other concepts, or Qloo tag URNs; not named entities."
          }
        },
        additionalProperties: false
      },
      behavior: {
        readOnly: true,
        idempotent: true,
        mutating: false,
        destructive: false,
        openWorld: true,
        concurrency: "safe_for_independent_inputs",
        requiredCredential: "qloo_api",
        defaultResultBudget: 10,
        maximumResultBudget: 20,
        safeRetryClasses: [
          "dns",
          "connect",
          "timeout",
          "rate_limit",
          "upstream_5xx"
        ],
        supportedTransports: [
          "direct",
          "mcp"
        ],
        expectedLatency: "medium"
      },
      documentation: [
        "https://docs.qloo.com/reference/insights-api-deep-dive"
      ]
    },
    {
      id: "describe",
      shared_tool_name: "qloo_describe",
      summary: "Resolve and describe one Qloo entity.",
      description: "Resolve one named entity or Qloo UUID and return only metadata present in Qloo.",
      input_schema: {
        type: "object",
        required: [
          "entity"
        ],
        properties: {
          entity: {
            type: "string",
            minLength: 1
          },
          type: {
            type: "string",
            enum: [
              "artist",
              "book",
              "brand",
              "movie",
              "person",
              "place",
              "podcast",
              "tv_show",
              "videogame",
              "locality",
              "actor",
              "album",
              "author",
              "director"
            ],
            description: "Qloo search entity type: artist, book, brand, movie, person, place, podcast, tv_show, videogame, locality, actor, album, author, director."
          }
        },
        additionalProperties: false
      },
      behavior: {
        readOnly: true,
        idempotent: true,
        mutating: false,
        destructive: false,
        openWorld: true,
        concurrency: "safe_for_independent_inputs",
        requiredCredential: "qloo_api",
        defaultResultBudget: 10,
        maximumResultBudget: 20,
        safeRetryClasses: [
          "dns",
          "connect",
          "timeout",
          "rate_limit",
          "upstream_5xx"
        ],
        supportedTransports: [
          "direct",
          "mcp"
        ],
        expectedLatency: "low"
      },
      documentation: [
        "https://docs.qloo.com/reference/get-search",
        "https://docs.qloo.com/reference/get-entities"
      ]
    },
    {
      id: "where_popular",
      shared_tool_name: "qloo_where_popular",
      summary: "Find geographic areas where an entity has comparatively strong affinity.",
      description: "Find geographic areas where one entity has strong query-relative affinity. This is distinct from filtering recommendations to a place.",
      input_schema: {
        type: "object",
        required: [
          "entity",
          "within"
        ],
        properties: {
          entity: {
            type: "string",
            minLength: 1
          },
          entity_type: {
            type: "string",
            enum: [
              "artist",
              "book",
              "brand",
              "movie",
              "person",
              "place",
              "podcast",
              "tv_show",
              "videogame",
              "locality",
              "actor",
              "album",
              "author",
              "director"
            ],
            description: "Qloo search entity type: artist, book, brand, movie, person, place, podcast, tv_show, videogame, locality, actor, album, author, director."
          },
          within: {
            type: "string",
            minLength: 1,
            description: "Required geographic area that constrains the heatmap."
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 10,
            description: "Maximum results to return (1-20)."
          }
        },
        additionalProperties: false
      },
      behavior: {
        readOnly: true,
        idempotent: true,
        mutating: false,
        destructive: false,
        openWorld: true,
        concurrency: "safe_for_independent_inputs",
        requiredCredential: "qloo_api",
        defaultResultBudget: 10,
        maximumResultBudget: 20,
        safeRetryClasses: [
          "dns",
          "connect",
          "timeout",
          "rate_limit",
          "upstream_5xx"
        ],
        supportedTransports: [
          "direct",
          "mcp"
        ],
        expectedLatency: "low"
      },
      documentation: [
        "https://docs.qloo.com/reference/heatmaps-use-case"
      ]
    },
    {
      id: "compare_audiences",
      shared_tool_name: "qloo_compare_audiences",
      summary: "Contrast two signal groups and identify shared or differentiating affinities.",
      description: "Compare two complete groups of entity signals in one Qloo analysis request.",
      input_schema: {
        type: "object",
        required: [
          "group_a",
          "group_b"
        ],
        properties: {
          group_a: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            },
            minItems: 1,
            maxItems: 10,
            description: "Named entities or Qloo entity UUIDs; use tag fields for abstract concepts."
          },
          group_b: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            },
            minItems: 1,
            maxItems: 10,
            description: "Named entities or Qloo entity UUIDs; use tag fields for abstract concepts."
          },
          target_type: {
            type: "string",
            enum: [
              "artist",
              "book",
              "brand",
              "movie",
              "person",
              "place",
              "podcast",
              "tv_show",
              "videogame"
            ],
            description: "Qloo Insights entity type: artist, book, brand, movie, person, place, podcast, tv_show, videogame."
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 10,
            description: "Maximum results to return (1-20)."
          }
        },
        additionalProperties: false
      },
      behavior: {
        readOnly: true,
        idempotent: true,
        mutating: false,
        destructive: false,
        openWorld: true,
        concurrency: "safe_for_independent_inputs",
        requiredCredential: "qloo_api",
        defaultResultBudget: 10,
        maximumResultBudget: 20,
        safeRetryClasses: [
          "dns",
          "connect",
          "timeout",
          "rate_limit",
          "upstream_5xx"
        ],
        supportedTransports: [
          "direct",
          "mcp"
        ],
        expectedLatency: "medium"
      },
      documentation: [
        "https://docs.qloo.com/reference/analysis-compare"
      ]
    },
    {
      id: "entity_tags",
      shared_tool_name: "qloo_entity_tags",
      summary: "Retrieve concepts and tags that characterize entities.",
      description: "Retrieve Qloo concepts that jointly characterize one or more entities using the documented urn:tag Insights workflow.",
      input_schema: {
        type: "object",
        required: [
          "entities"
        ],
        properties: {
          entities: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            },
            minItems: 1,
            maxItems: 10,
            description: "Named entities or Qloo entity UUIDs; use tag fields for abstract concepts."
          },
          entity_type: {
            type: "string",
            enum: [
              "artist",
              "book",
              "brand",
              "movie",
              "person",
              "place",
              "podcast",
              "tv_show",
              "videogame",
              "locality",
              "actor",
              "album",
              "author",
              "director"
            ],
            description: "Qloo search entity type: artist, book, brand, movie, person, place, podcast, tv_show, videogame, locality, actor, album, author, director."
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 10,
            description: "Maximum results to return (1-20)."
          }
        },
        additionalProperties: false
      },
      behavior: {
        readOnly: true,
        idempotent: true,
        mutating: false,
        destructive: false,
        openWorld: true,
        concurrency: "safe_for_independent_inputs",
        requiredCredential: "qloo_api",
        defaultResultBudget: 10,
        maximumResultBudget: 20,
        safeRetryClasses: [
          "dns",
          "connect",
          "timeout",
          "rate_limit",
          "upstream_5xx"
        ],
        supportedTransports: [
          "direct",
          "mcp"
        ],
        expectedLatency: "medium"
      },
      documentation: [
        "https://docs.qloo.com/reference/taste-analysis"
      ]
    },
    {
      id: "audience_demographics",
      shared_tool_name: "qloo_audience_demographics",
      summary: "Retrieve aggregate audience segments associated with an entity.",
      description: "Retrieve aggregate demographic distributions associated with one entity through the documented urn:demographics Insights workflow.",
      input_schema: {
        type: "object",
        required: [
          "entity"
        ],
        properties: {
          entity: {
            type: "string",
            minLength: 1
          },
          entity_type: {
            type: "string",
            enum: [
              "artist",
              "book",
              "brand",
              "movie",
              "person",
              "place",
              "podcast",
              "tv_show",
              "videogame",
              "locality",
              "actor",
              "album",
              "author",
              "director"
            ],
            description: "Qloo search entity type: artist, book, brand, movie, person, place, podcast, tv_show, videogame, locality, actor, album, author, director."
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 10,
            description: "Maximum results to return (1-20)."
          }
        },
        additionalProperties: false
      },
      behavior: {
        readOnly: true,
        idempotent: true,
        mutating: false,
        destructive: false,
        openWorld: true,
        concurrency: "safe_for_independent_inputs",
        requiredCredential: "qloo_api",
        defaultResultBudget: 10,
        maximumResultBudget: 20,
        safeRetryClasses: [
          "dns",
          "connect",
          "timeout",
          "rate_limit",
          "upstream_5xx"
        ],
        supportedTransports: [
          "direct",
          "mcp"
        ],
        expectedLatency: "medium"
      },
      documentation: [
        "https://docs.qloo.com/reference/demographics-use-case"
      ]
    },
    {
      id: "trends",
      shared_tool_name: "qloo_trends",
      summary: "Retrieve interest or trend information over a time range.",
      description: "Retrieve Qloo time-series popularity metrics for one to five resolved entities over an ISO date range.",
      input_schema: {
        type: "object",
        required: [
          "entities",
          "entity_type",
          "start_date",
          "end_date"
        ],
        properties: {
          entities: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            },
            minItems: 1,
            maxItems: 5
          },
          entity_type: {
            type: "string",
            enum: [
              "artist",
              "book",
              "brand",
              "movie",
              "person",
              "place",
              "podcast",
              "tv_show",
              "videogame"
            ],
            description: "Qloo Insights entity type: artist, book, brand, movie, person, place, podcast, tv_show, videogame."
          },
          start_date: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            description: "Inclusive start date in YYYY-MM-DD format."
          },
          end_date: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            description: "Inclusive end date in YYYY-MM-DD format."
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 10,
            description: "Maximum results to return (1-20)."
          }
        },
        additionalProperties: false
      },
      behavior: {
        readOnly: true,
        idempotent: true,
        mutating: false,
        destructive: false,
        openWorld: true,
        concurrency: "safe_for_independent_inputs",
        requiredCredential: "qloo_api",
        defaultResultBudget: 10,
        maximumResultBudget: 20,
        safeRetryClasses: [
          "dns",
          "connect",
          "timeout",
          "rate_limit",
          "upstream_5xx"
        ],
        supportedTransports: [
          "direct",
          "mcp"
        ],
        expectedLatency: "medium"
      },
      documentation: [
        "https://docs.qloo.com/reference/get-trending"
      ]
    },
    {
      id: "find_tags",
      shared_tool_name: "qloo_find_tags",
      summary: "Search the Qloo tag ontology by natural-language concept.",
      description: "Search Qloo's tag ontology by natural-language concept and return stable tag URNs.",
      input_schema: {
        type: "object",
        required: [
          "query"
        ],
        properties: {
          query: {
            type: "string",
            minLength: 1
          },
          semantic: {
            type: "boolean",
            default: true
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 10,
            description: "Maximum results to return (1-20)."
          }
        },
        additionalProperties: false
      },
      behavior: {
        readOnly: true,
        idempotent: true,
        mutating: false,
        destructive: false,
        openWorld: true,
        concurrency: "safe_for_independent_inputs",
        requiredCredential: "qloo_api",
        defaultResultBudget: 10,
        maximumResultBudget: 20,
        safeRetryClasses: [
          "dns",
          "connect",
          "timeout",
          "rate_limit",
          "upstream_5xx"
        ],
        supportedTransports: [
          "direct",
          "mcp"
        ],
        expectedLatency: "low"
      },
      documentation: [
        "https://docs.qloo.com/reference/get-tags-1"
      ]
    }
  ],
  upstream: {
    documentation_url: "https://docs.qloo.com",
    api_version: "2.0",
    openapi_version: "3.1.0",
    production_server: "https://api.qloo.com",
    lock_sha256: "da8d4b830f2a646815d25afcaa653f81f1ad939707e2e2560d2d0b9f103076f1",
    get_paths: [
      "/",
      "/entities",
      "/search",
      "/v2/analysis/compare",
      "/v2/audiences",
      "/v2/audiences/types",
      "/v2/insights",
      "/v2/tags",
      "/v2/tags/types",
      "/v2/trending"
    ],
    documented_exceptions: [
      {
        value: "urn:demographics",
        scope: "/v2/insights filter.type",
        status: "documented-but-not-enumerated",
        documentationUrl: "https://docs.qloo.com/reference/demographics-use-case",
        treatment: "Preserve as an explicit documentation exception; do not synthesize an endpoint payload schema from it."
      },
      {
        value: "urn:tag",
        scope: "/v2/insights filter.type",
        status: "documented-but-not-enumerated",
        documentationUrl: "https://docs.qloo.com/reference/taste-analysis",
        treatment: "The pinned specification mentions this value in diversify.by documentation but omits it from the filter.type enum; preserve the discrepancy for review."
      }
    ]
  },
  contract_checksum: "sha256:762bdcc5e14ff797b6de739d2658a83f78af35e68d7a5a3449455be6046924f5"
};

// apps/qloo-cli/dist/mcp.js
var pkgVersion = "1.0.0";
var TYPE_ALIASES2 = {
  movie: "urn:entity:movie",
  movies: "urn:entity:movie",
  tv: "urn:entity:tv_show",
  tv_show: "urn:entity:tv_show",
  tvshow: "urn:entity:tv_show",
  show: "urn:entity:tv_show",
  book: "urn:entity:book",
  books: "urn:entity:book",
  brand: "urn:entity:brand",
  brands: "urn:entity:brand",
  music: "urn:entity:music_artist",
  artist: "urn:entity:music_artist",
  music_artist: "urn:entity:music_artist",
  restaurant: "urn:entity:place:restaurant",
  restaurants: "urn:entity:place:restaurant",
  place: "urn:entity:place",
  person: "urn:entity:person"
};
var resolveType = (input) => TYPE_ALIASES2[input.toLowerCase()] ?? input;
var LEGACY_TOOLS = [
  {
    name: "qloo_insights",
    description: "Get taste-based recommendations. Returns entities ranked by affinity to the given signals.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Entity type URN or alias (e.g. 'movie', 'restaurant', 'urn:entity:book')" },
        signal_entities: { type: "string", description: "Comma-separated entity IDs to use as interest signals" },
        signal_tags: { type: "string", description: "Comma-separated tag URNs to use as interest signals" },
        signal_location: { type: "string", description: "Location query for personalization signal" },
        filter_location: { type: "string", description: "Filter results by location" },
        take: { type: "string", description: "Number of results (default 10)" },
        fields: { type: "string", description: "Comma-separated fields to return (limits response size)" }
      },
      required: ["type"]
    }
  },
  {
    name: "qloo_search",
    description: "Search for entities by name.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query text" },
        type: { type: "string", description: "Entity type URN or alias to filter" },
        take: { type: "string", description: "Number of results (default 10)" },
        fields: { type: "string", description: "Comma-separated fields to return" }
      },
      required: ["query"]
    }
  },
  {
    name: "qloo_entity",
    description: "Get detailed information about one or more entities by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Entity ID (UUID) or comma-separated IDs" },
        fields: { type: "string", description: "Comma-separated fields to return" }
      },
      required: ["id"]
    }
  },
  {
    name: "qloo_analyze",
    description: "Compare two groups of entities and find differentiating attributes.",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "string", description: "First group: comma-separated entity IDs" },
        b: { type: "string", description: "Second group: comma-separated entity IDs" },
        type: { type: "string", description: "Entity type to analyze" },
        take: { type: "string", description: "Number of results (default 10)" },
        fields: { type: "string", description: "Comma-separated fields to return" }
      },
      required: ["a", "b"]
    }
  },
  {
    name: "qloo_tags",
    description: "Search and browse Qloo tags.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for tags" },
        type: { type: "string", description: "Tag type to filter (e.g. genre:media)" },
        take: { type: "string", description: "Number of results (default 10)" }
      },
      required: []
    }
  },
  {
    name: "qloo_recommend",
    description: "Get recommendations from natural language. Requires a taste resolver service.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language taste description (e.g. 'Italian restaurants for Sopranos fans')" },
        type: { type: "string", description: "Entity type hint (usually inferred)" },
        take: { type: "string", description: "Number of results (default 10)" }
      },
      required: ["query"]
    }
  }
];
var READ_ONLY_OPEN_WORLD_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
});
var CAPABILITIES_TOOL = {
  name: "qloo_capabilities",
  description: "Inspect the canonical Qloo workflow contract and this server's explicit compatibility level without calling Qloo.",
  inputSchema: {
    type: "object",
    properties: {
      operation_ids: {
        type: "array",
        items: {
          type: "string",
          enum: qloo_workflow_contract_default.operations.map(({ id }) => id)
        },
        uniqueItems: true,
        description: "Optional canonical workflow operation IDs to inspect."
      }
    },
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    required: [
      "manifest_schema_version",
      "contract_version",
      "contract_checksum",
      "result_schema_version",
      "adapter",
      "operations"
    ],
    properties: {
      manifest_schema_version: { type: "string" },
      contract_version: { type: "string" },
      contract_checksum: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      result_schema_version: { type: "string" },
      adapter: { type: "object" },
      operations: { type: "array" }
    },
    additionalProperties: true
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};
var TOOLS = [
  CAPABILITIES_TOOL,
  ...LEGACY_TOOLS.map((tool) => ({
    ...tool,
    annotations: READ_ONLY_OPEN_WORLD_ANNOTATIONS
  }))
];
function legacyMcpCapabilities(argumentsValue) {
  const argumentsRecord = argumentsValue !== null && typeof argumentsValue === "object" && !Array.isArray(argumentsValue) ? argumentsValue : {};
  const requested = Array.isArray(argumentsRecord.operation_ids) ? new Set(argumentsRecord.operation_ids.filter((value) => typeof value === "string")) : void 0;
  return {
    ...qloo_workflow_contract_default,
    adapter: {
      id: "qloo_cli_mcp",
      compatibility: "legacy_endpoint_tools",
      canonical_workflow_execution: false,
      supported_operation_ids: [],
      capabilities_tool: "qloo_capabilities",
      warning: "This server exposes legacy endpoint-shaped tools. Canonical nine-workflow MCP execution is not available on this adapter."
    },
    operations: requested ? qloo_workflow_contract_default.operations.filter(({ id }) => requested.has(id)) : qloo_workflow_contract_default.operations
  };
}
var executeTool = async (client, resolverUrl, name, args) => {
  switch (name) {
    case "qloo_insights": {
      const params = {
        "filter.type": resolveType(args.type ?? ""),
        take: args.take ?? "10"
      };
      if (args.signal_entities)
        params["signal.interests.entities"] = args.signal_entities;
      if (args.signal_tags)
        params["signal.interests.tags"] = args.signal_tags;
      if (args.signal_location)
        params["signal.location.query"] = args.signal_location;
      if (args.filter_location)
        params["filter.location.query"] = args.filter_location;
      if (args.fields)
        params.fields = args.fields;
      return client.getInsights(params);
    }
    case "qloo_search": {
      const params = {
        query: args.query ?? "",
        take: args.take ?? "10"
      };
      if (args.type)
        params.types = resolveType(args.type);
      if (args.fields)
        params.fields = args.fields;
      return client.searchEntities(params);
    }
    case "qloo_entity": {
      const ids = (args.id ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return client.getEntities(ids);
    }
    case "qloo_analyze": {
      const params = {
        "a.signal.interests.entities": args.a ?? "",
        "b.signal.interests.entities": args.b ?? "",
        take: args.take ?? "10"
      };
      if (args.type)
        params["filter.type"] = resolveType(args.type);
      if (args.fields)
        params.fields = args.fields;
      return client.analyzeCompare(params);
    }
    case "qloo_tags": {
      const params = {};
      if (args.query)
        params["filter.query"] = args.query;
      if (args.type) {
        const typeVal = args.type.startsWith("urn:") ? args.type : `urn:tag:${args.type}`;
        params["filter.tag.types"] = typeVal;
      }
      if (args.take)
        params.take = args.take;
      return client.searchTags(params);
    }
    case "qloo_recommend": {
      const body = {
        input: args.query ?? "",
        options: { take: parseInt(args.take ?? "10", 10) }
      };
      if (args.type)
        body.filter_type = resolveType(args.type);
      const resp = await fetch(`${resolverUrl}/v1/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!resp.ok)
        throw new Error(`Taste resolver returned ${resp.status}`);
      return resp.json();
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};
var respond = (writeOut, id, result) => {
  const msg = { jsonrpc: "2.0", id, result };
  writeOut(JSON.stringify(msg) + "\n");
};
var respondError = (writeOut, id, code, message) => {
  const msg = { jsonrpc: "2.0", id, error: { code, message } };
  writeOut(JSON.stringify(msg) + "\n");
};
var startMcpServer = (apiKey, baseUrl, resolverUrl, io = {}, allowCustomBaseUrl = false) => {
  const client = new QlooApiClient({ apiKey, baseUrl, allowCustomBaseUrl });
  const resolver = resolverUrl ?? "http://localhost:8000";
  const writeOut = io.writeOut ?? ((value) => process.stdout.write(value));
  const rl = createInterface({ input: io.input ?? process.stdin, terminal: false });
  rl.on("line", async (line) => {
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      respondError(writeOut, null, -32700, "Parse error");
      return;
    }
    const id = req.id ?? null;
    switch (req.method) {
      case "initialize":
        respond(writeOut, id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "qloo-cli", version: pkgVersion }
        });
        break;
      case "notifications/initialized":
        break;
      case "tools/list":
        respond(writeOut, id, { tools: TOOLS });
        break;
      case "tools/call": {
        const toolName = req.params?.name;
        const rawToolArgs = req.params?.arguments ?? {};
        const toolArgs = rawToolArgs;
        try {
          const result = toolName === "qloo_capabilities" ? legacyMcpCapabilities(rawToolArgs) : await executeTool(client, resolver, toolName, toolArgs);
          respond(writeOut, id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            ...result !== null && typeof result === "object" ? { structuredContent: result } : {}
          });
        } catch (err) {
          respond(writeOut, id, {
            content: [
              {
                type: "text",
                text: `Error: ${err instanceof Error ? err.message : String(err)}`
              }
            ],
            isError: true
          });
        }
        break;
      }
      default:
        respondError(writeOut, id, -32601, `Method not found: ${req.method}`);
    }
  });
};

// apps/qloo-cli/dist/cli.js
var pkgVersion2 = "1.0.0";
var buildRuntime = (options) => ({
  writeOut: options.writeOut ?? ((value) => process.stdout.write(value)),
  writeErr: options.writeErr ?? ((value) => process.stderr.write(value)),
  env: options.env ?? process.env,
  stdin: options.stdin ?? process.stdin,
  stdoutIsTTY: options.stdoutIsTTY ?? Boolean(process.stdout.isTTY)
});
var createApiCliProgram = (options = {}) => {
  const runtime = buildRuntime(options);
  const program2 = new Command();
  const configPath = getConfigPath(runtime.env);
  program2.configureOutput({
    writeOut: runtime.writeOut,
    writeErr: runtime.writeErr
  });
  program2.exitOverride();
  let cachedConfig = null;
  const getConfig = () => {
    if (!cachedConfig) {
      cachedConfig = loadConfig(configPath);
    }
    return cachedConfig;
  };
  let apiKeyWarningShown = false;
  const warnApiKeyFlag = () => {
    if (apiKeyWarningShown)
      return;
    const quiet = program2.opts().quiet ?? false;
    if (quiet)
      return;
    apiKeyWarningShown = true;
    runtime.writeErr("Warning: Using --api-key flag exposes your key in process listings. Consider using QLOO_API_KEY env var or `qloo config set api-key` instead.\n");
  };
  const buildFirstRunMessage = () => [
    "Welcome to Qloo CLI! It looks like this is your first run.",
    "To get started, set your API key:",
    "  qloo config set api-key YOUR_KEY",
    "Or export it as an environment variable:",
    "  export QLOO_API_KEY=your_key"
  ].join("\n");
  const buildMissingKeyMessage = () => [
    "No API key found. Provide one via:",
    "  qloo config set api-key YOUR_KEY",
    "  export QLOO_API_KEY=your_key",
    "  --api-key flag"
  ].join("\n");
  const getApiKey = (options2, jsonMode) => {
    if (options2.apiKey) {
      warnApiKeyFlag();
      return options2.apiKey;
    }
    if (runtime.env.QLOO_API_KEY) {
      return runtime.env.QLOO_API_KEY;
    }
    const config = getConfig();
    if (config.api_key) {
      return config.api_key;
    }
    const message = configDirExists(configPath) ? buildMissingKeyMessage() : buildFirstRunMessage();
    return failWith(EXIT_AUTH, message, jsonMode);
  };
  const createClient = (options2, jsonMode) => {
    const apiKey = getApiKey(options2, jsonMode);
    const config = getConfig();
    const baseUrl = runtime.env.QLOO_BASE_URL?.trim() || config.base_url;
    const environmentTrust = runtime.env.QLOO_TRUSTED_BASE_URL?.trim();
    const allowCustomBaseUrl = !baseUrl || isOfficialQlooBaseUrl(baseUrl) || Boolean(environmentTrust && areEquivalentQlooBaseUrls(baseUrl, environmentTrust)) || Boolean(config.trusted_base_url && areEquivalentQlooBaseUrls(baseUrl, config.trusted_base_url));
    return new QlooApiClient({
      apiKey,
      baseUrl,
      allowCustomBaseUrl
    });
  };
  const failFromError = (err, jsonMode, prefix = "") => {
    if (err instanceof CliExitError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    return failWith(EXIT_API, `${prefix}${message}`, jsonMode);
  };
  const getOutputFormat = (options2) => {
    if (options2.json)
      return "json";
    if (options2.plain)
      return "plain";
    if (!runtime.stdoutIsTTY)
      return "json";
    return "table";
  };
  const TYPE_ALIASES3 = {
    // movie
    movie: "urn:entity:movie",
    movies: "urn:entity:movie",
    // tv_show
    tv: "urn:entity:tv_show",
    tv_show: "urn:entity:tv_show",
    tvshow: "urn:entity:tv_show",
    show: "urn:entity:tv_show",
    // book
    book: "urn:entity:book",
    books: "urn:entity:book",
    // brand
    brand: "urn:entity:brand",
    brands: "urn:entity:brand",
    // artist
    music: "urn:entity:artist",
    artist: "urn:entity:artist",
    music_artist: "urn:entity:artist",
    // person
    person: "urn:entity:person",
    // actor
    actor: "urn:entity:actor",
    actors: "urn:entity:actor",
    // director
    director: "urn:entity:director",
    directors: "urn:entity:director",
    // author
    author: "urn:entity:author",
    authors: "urn:entity:author",
    // locality
    locality: "urn:entity:locality",
    localities: "urn:entity:locality",
    // videogame
    videogame: "urn:entity:videogame",
    videogames: "urn:entity:videogame",
    video_game: "urn:entity:videogame",
    video_games: "urn:entity:videogame",
    // podcast
    podcast: "urn:entity:podcast",
    podcasts: "urn:entity:podcast",
    // place (restaurants are places filtered by tag)
    place: "urn:entity:place",
    restaurant: "urn:entity:place",
    restaurants: "urn:entity:place"
  };
  const ENTITY_TYPES = [
    { urn: "urn:entity:movie", name: "Movie" },
    { urn: "urn:entity:tv_show", name: "TV Show" },
    { urn: "urn:entity:book", name: "Book" },
    { urn: "urn:entity:brand", name: "Brand" },
    { urn: "urn:entity:artist", name: "Artist" },
    { urn: "urn:entity:person", name: "Person" },
    { urn: "urn:entity:actor", name: "Actor" },
    { urn: "urn:entity:director", name: "Director" },
    { urn: "urn:entity:author", name: "Author" },
    { urn: "urn:entity:locality", name: "Locality" },
    { urn: "urn:entity:videogame", name: "Video Game" },
    { urn: "urn:entity:podcast", name: "Podcast" },
    { urn: "urn:entity:place", name: "Place" }
  ];
  const resolveType2 = (input) => TYPE_ALIASES3[input.toLowerCase()] ?? input;
  function entityTypeHelpText() {
    const aliasesByUrn = {};
    for (const [alias, urn] of Object.entries(TYPE_ALIASES3)) {
      if (!aliasesByUrn[urn])
        aliasesByUrn[urn] = [];
      aliasesByUrn[urn].push(alias);
    }
    const maxUrnLen = Math.max(...ENTITY_TYPES.map((t) => t.urn.length));
    const lines = ENTITY_TYPES.map((t) => {
      const aliases = aliasesByUrn[t.urn] ?? [];
      const aliasStr = aliases.length ? `  aliases: ${aliases.join(", ")}` : "";
      return `  ${t.urn.padEnd(maxUrnLen)}${aliasStr}`;
    });
    return "\nEntity Types:\n" + lines.join("\n") + "\n";
  }
  const MAX_STDIN_BYTES = 1024 * 1024;
  const readStdinLines = async () => {
    let raw = "";
    for await (const chunk of runtime.stdin) {
      raw += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (Buffer.byteLength(raw, "utf8") > MAX_STDIN_BYTES) {
        throw new Error(`stdin exceeds the ${MAX_STDIN_BYTES}-byte input limit`);
      }
    }
    return raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).join(",");
  };
  const resolveStdinValue = async (value) => value === "-" ? readStdinLines() : value;
  const serializeOption = (opt) => ({
    flag: opt.long ?? opt.short ?? opt.flags,
    short: opt.short ?? void 0,
    description: opt.description,
    required: opt.mandatory,
    type: opt.isBoolean() ? "boolean" : "string",
    ...opt.defaultValue !== void 0 ? { defaultValue: opt.defaultValue } : {}
  });
  const serializeArgument = (arg) => ({
    name: arg.name(),
    description: arg.description,
    required: arg.required,
    variadic: arg.variadic,
    ...arg.defaultValue !== void 0 ? { defaultValue: arg.defaultValue } : {}
  });
  const serializeCommand = (cmd) => ({
    name: cmd.name(),
    description: cmd.description(),
    options: cmd.options.filter((o) => !o.hidden).map(serializeOption),
    arguments: cmd.registeredArguments.map(serializeArgument)
  });
  const buildSchema = (prog) => ({
    name: prog.name(),
    version: prog.version() ?? "0.0.0",
    commands: prog.commands.filter((cmd) => cmd.name() !== "help").map(serializeCommand)
  });
  program2.name("qloo").description("CLI for Qloo's Insights API").version(pkgVersion2).option("--api-key <key>", "Qloo API key (or set QLOO_API_KEY env var)").option("--no-color", "Disable colored output (also respects NO_COLOR env var)").option("--verbose", "Show additional diagnostic information (API URLs, timing)").option("--quiet", "Suppress all stderr output except errors");
  program2.hook("preAction", () => {
    const globalOpts = program2.opts();
    setColorDisabled(!globalOpts.color);
    setVerbosity(Boolean(globalOpts.verbose), Boolean(globalOpts.quiet));
  });
  program2.command("insights").description("Get taste-based insights and recommendations").requiredOption("-t, --type <urn>", "Entity type URN or alias (see Entity Types below)").option("-s, --signal-entities <urns>", "Comma-separated entity IDs or URNs to use as interest signals").option("--signal-query <text>", "Search for an entity by name and use the top result as a signal (e.g. 'Breaking Bad')").option("--signal-query-type <urn>", "Entity type to scope the --signal-query search (see Entity Types below)").option("--signal-tags <tags>", "Comma-separated tag URNs to use as interest signals").option("--for <description>", "Natural language taste description (e.g. 'Breaking Bad fans who love craft beer')").option("--filter-tags <tags>", "Comma-separated tag URNs to filter results").option("--filter-location <loc>", "Filter results by location query").option("--signal-location <loc>", "Use location as a signal for personalization").option("--signal-entities-weight <n>", "Weight for entity signals (0-1)").option("--signal-tags-weight <n>", "Weight for tag signals (0-1)").option("--signal-location-weight <n>", "Weight for location signal (0-1)").option("-n, --take <n>", "Number of results to return", "10").option("-p, --page <n>", "Page number (1-indexed)").option("--offset <n>", "Offset for pagination").option("-j, --json", "Output as JSON").option("--plain", "Output as TSV").option("--fields <fields>", "Comma-separated fields to include in output").option("--dry-run", "Show request details without calling the API").option("--params <json>", "Raw JSON params to merge with flags").addHelpText("after", `
Examples:
  qloo insights --type movie --signal-query "Breaking Bad" --signal-query-type tv
  qloo insights -t restaurant --for "craft beer lovers" --filter-location "Brooklyn, NY"
  qloo insights -t movie --signal-entities "ID1" --fields "name,affinity" --dry-run
`).addHelpText("after", entityTypeHelpText).action(async (options2) => {
    const jsonMode = Boolean(options2.json);
    const client = createClient(program2.opts(), jsonMode);
    const format = getOutputFormat(options2);
    const params = {
      "filter.type": resolveType2(options2.type),
      take: options2.take
    };
    if (options2.params) {
      const extra = safeParseJson(options2.params, "--params", jsonMode);
      Object.assign(params, extra);
    }
    if (options2.fields) {
      params.fields = options2.fields;
    }
    if (options2.for) {
      const config = getConfig();
      const resolverUrl = runtime.env.TASTE_RESOLVER_URL || config.taste_resolver_url || "http://localhost:8000/v1/resolve";
      try {
        verbose(`Taste resolver URL: ${resolverUrl}`);
        const resolverResp = await fetch(resolverUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: options2.for,
            filter_type: resolveType2(options2.type),
            options: { include_resolution: true }
          })
        });
        if (!resolverResp.ok) {
          throw new Error(`Resolver returned ${resolverResp.status}`);
        }
        const resolved = await resolverResp.json();
        if (resolved.params) {
          info(`Resolved taste profile from: "${options2.for}"`);
          Object.assign(params, resolved.params);
        }
      } catch (err) {
        warn(`Taste resolver unavailable (${err instanceof Error ? err.message : String(err)}), continuing with other flags`);
      }
    }
    if (options2.signalQuery) {
      const searchParams = { query: options2.signalQuery, take: "1" };
      if (options2.signalQueryType)
        searchParams.types = resolveType2(options2.signalQueryType);
      try {
        const searchResp = await client.searchEntities(searchParams);
        const results = searchResp.results || [];
        const top = Array.isArray(results) ? results[0] : results?.entities?.[0];
        if (!top) {
          failWith(EXIT_NOT_FOUND, `No entity found for query "${options2.signalQuery}"`, jsonMode);
        }
        info(`Using signal: ${top.name} (${top.entity_id})`);
        params["signal.interests.entities"] = top.entity_id;
      } catch (err) {
        failFromError(err, jsonMode, "Error resolving --signal-query: ");
      }
    }
    const signalEntitiesValue = await resolveStdinValue(options2.signalEntities);
    if (signalEntitiesValue) {
      validateResourceIds(signalEntitiesValue, "--signal-entities", jsonMode);
      params["signal.interests.entities"] = signalEntitiesValue;
    }
    if (options2.signalTags) {
      params["signal.interests.tags"] = options2.signalTags;
    }
    if (options2.filterTags) {
      params["filter.tags"] = options2.filterTags;
    }
    if (options2.filterLocation) {
      params["filter.location.query"] = options2.filterLocation;
    }
    if (options2.signalLocation) {
      params["signal.location.query"] = options2.signalLocation;
    }
    if (options2.signalEntitiesWeight) {
      params["signal.interests.entities.weight"] = options2.signalEntitiesWeight;
    }
    if (options2.signalTagsWeight) {
      params["signal.interests.tags.weight"] = options2.signalTagsWeight;
    }
    if (options2.signalLocationWeight) {
      params["signal.location.weight"] = options2.signalLocationWeight;
    }
    if (options2.page) {
      params.page = options2.page;
    }
    if (options2.offset) {
      params.offset = options2.offset;
    }
    if (options2.dryRun) {
      const config = getConfig();
      const baseUrl = config.base_url || "https://api.qloo.com";
      runtime.writeOut(JSON.stringify({ method: "GET", url: `${baseUrl}/v2/insights`, params }, null, 2) + "\n");
      return;
    }
    try {
      const response = await client.getInsights(params);
      const entities = response.results?.entities || [];
      const take = parseInt(options2.take, 10);
      const page = options2.page ? parseInt(options2.page, 10) : 1;
      const showPaginationFooter = format === "table" && entities.length === take;
      runtime.writeOut(formatEntities(entities, { format }) + "\n");
      if (showPaginationFooter) {
        info(`
Showing ${entities.length} results, page ${page} \u2014 use --page ${page + 1} for more`);
      }
    } catch (err) {
      failFromError(err, jsonMode);
    }
  });
  program2.command("recommend").description("Get recommendations from natural language \u2014 no flags needed").argument("<query...>", "Natural language taste description (e.g. 'Italian restaurants for Sopranos fans in Brooklyn')").option("-t, --type <urn>", "Entity type hint (usually inferred automatically)").option("-n, --take <n>", "Number of results to return", "10").option("--explain", "Include resolution breakdown in output").option("-j, --json", "Output as JSON").option("--plain", "Output as TSV").option("--dry-run", "Show request details without calling the API").addHelpText("after", `
Examples:
  qloo recommend Italian restaurants for Sopranos fans in Brooklyn
  qloo recommend movies like Parasite --take 20 --json
`).addHelpText("after", entityTypeHelpText).action(async (queryParts, options2) => {
    const jsonMode = Boolean(options2.json);
    const format = getOutputFormat(options2);
    const query = queryParts.join(" ");
    const config = getConfig();
    const resolverUrl = runtime.env.TASTE_RESOLVER_URL || config.taste_resolver_url || "http://localhost:8000";
    const body = {
      input: query,
      options: {
        take: parseInt(options2.take, 10),
        explain: Boolean(options2.explain)
      }
    };
    if (options2.type) {
      body.filter_type = resolveType2(options2.type);
    }
    try {
      verbose(`Recommend URL: ${resolverUrl}/v1/recommend`);
      const startTime = performance.now();
      const resp = await fetch(`${resolverUrl}/v1/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const elapsed = performance.now() - startTime;
      verbose(`Recommend response: ${resp.status} in ${elapsed.toFixed(0)}ms`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || err.message || `Taste resolver returned ${resp.status}`);
      }
      const data = await resp.json();
      data.warnings.forEach((w) => warn(w));
      if (format === "json") {
        runtime.writeOut(JSON.stringify(data, null, 2) + "\n");
        return;
      }
      if (options2.explain && data.resolution) {
        info(`
Resolution (confidence: ${data.confidence.toFixed(2)}):
${JSON.stringify(data.resolution, null, 2)}
`);
      }
      const entities = data.entities;
      runtime.writeOut(formatEntities(entities, { format }) + "\n");
      if (format === "table" && entities.length > 0) {
        info(`
${entities.length} results (confidence: ${data.confidence.toFixed(2)})`);
      }
    } catch (err) {
      failFromError(err, jsonMode);
    }
  });
  program2.command("search").description("Search for entities by name").requiredOption("-q, --query <text>", "Search query text").option("-t, --type <urn>", "Entity type URN or alias to filter (see Entity Types below)").option("-n, --take <n>", "Number of results to return", "10").option("-p, --page <n>", "Page number (1-indexed)").option("--offset <n>", "Offset for pagination").option("-j, --json", "Output as JSON").option("--plain", "Output as TSV").option("--fields <fields>", "Comma-separated fields to include in output").option("--dry-run", "Show request details without calling the API").option("--params <json>", "Raw JSON params to merge with flags").addHelpText("after", `
Examples:
  qloo search --query "Italian" --type restaurant --take 5
  qloo search -q "Radiohead" -t music
`).addHelpText("after", entityTypeHelpText).action(async (options2) => {
    const jsonMode = Boolean(options2.json);
    const client = createClient(program2.opts(), jsonMode);
    const format = getOutputFormat(options2);
    rejectControlChars(options2.query, "--query", jsonMode);
    const params = {
      query: options2.query,
      take: options2.take
    };
    if (options2.params) {
      const extra = safeParseJson(options2.params, "--params", jsonMode);
      Object.assign(params, extra);
    }
    if (options2.fields) {
      params.fields = options2.fields;
    }
    if (options2.type) {
      params.types = resolveType2(options2.type);
    }
    if (options2.page) {
      params.page = options2.page;
    }
    if (options2.offset) {
      params.offset = options2.offset;
    }
    if (options2.dryRun) {
      const config = getConfig();
      const baseUrl = config.base_url || "https://api.qloo.com";
      runtime.writeOut(JSON.stringify({ method: "GET", url: `${baseUrl}/search`, params }, null, 2) + "\n");
      return;
    }
    try {
      const response = await client.searchEntities(params);
      const entities = response.results || [];
      const take = parseInt(options2.take, 10);
      const page = options2.page ? parseInt(options2.page, 10) : 1;
      const showPaginationFooter = format === "table" && entities.length === take;
      runtime.writeOut(formatEntities(entities, { format }) + "\n");
      if (showPaginationFooter) {
        info(`
Showing ${entities.length} results, page ${page} \u2014 use --page ${page + 1} for more`);
      }
    } catch (err) {
      failFromError(err, jsonMode);
    }
  });
  program2.command("entity").description("Get detailed information about a specific entity").requiredOption("--id <urn>", "Entity ID (UUID or URN), or - to read from stdin").option("-j, --json", "Output as JSON").option("--plain", "Output as TSV").option("--fields <fields>", "Comma-separated fields to include in output").option("--dry-run", "Show request details without calling the API").addHelpText("after", `
Examples:
  qloo entity --id "urn:entity:movie:12345"
  qloo entity --id "urn:entity:place:restaurant:67890" --json
`).addHelpText("after", entityTypeHelpText).action(async (options2) => {
    const jsonMode = Boolean(options2.json);
    const client = createClient(program2.opts(), jsonMode);
    const format = getOutputFormat(options2);
    const resolvedId = await resolveStdinValue(options2.id) ?? options2.id;
    validateResourceIds(resolvedId, "--id", jsonMode);
    const entityIds = resolvedId.split(",").map((s) => s.trim()).filter(Boolean);
    if (options2.dryRun) {
      const config = getConfig();
      const baseUrl = config.base_url || "https://api.qloo.com";
      runtime.writeOut(JSON.stringify({ method: "GET", url: `${baseUrl}/entities`, params: { entity_ids: entityIds } }, null, 2) + "\n");
      return;
    }
    try {
      const response = await client.getEntities(entityIds);
      const entities = response.results?.entities || response.results || [];
      if (!Array.isArray(entities) || entities.length === 0) {
        failWith(EXIT_NOT_FOUND, "Entity not found.", jsonMode);
      }
      if (entityIds.length === 1) {
        runtime.writeOut(formatEntityDetail(entities[0], { format }) + "\n");
      } else {
        runtime.writeOut(formatEntities(entities, { format }) + "\n");
      }
    } catch (err) {
      failFromError(err, jsonMode);
    }
  });
  program2.command("analyze").description("Analyze and compare two groups of entities").requiredOption("--a <entities>", "First group: comma-separated entity IDs").requiredOption("--b <entities>", "Second group: comma-separated entity IDs").option("-t, --type <urn>", "Entity type URN or alias to analyze (see Entity Types below)").option("-n, --take <n>", "Number of results to return", "10").option("-j, --json", "Output as JSON").option("--plain", "Output as TSV").option("--fields <fields>", "Comma-separated fields to include in output").option("--dry-run", "Show request details without calling the API").option("--params <json>", "Raw JSON params to merge with flags").addHelpText("after", `
Examples:
  qloo analyze --a "entity-id-1,entity-id-2" --b "entity-id-3,entity-id-4" -t movie
  qloo analyze --a "entity-id-1" --b "entity-id-2" --json
`).addHelpText("after", entityTypeHelpText).action(async (options2) => {
    const jsonMode = Boolean(options2.json);
    const client = createClient(program2.opts(), jsonMode);
    const format = getOutputFormat(options2);
    validateResourceIds(options2.a, "--a", jsonMode);
    validateResourceIds(options2.b, "--b", jsonMode);
    const params = {
      "a.signal.interests.entities": options2.a,
      "b.signal.interests.entities": options2.b,
      take: options2.take
    };
    if (options2.params) {
      const extra = safeParseJson(options2.params, "--params", jsonMode);
      Object.assign(params, extra);
    }
    if (options2.fields) {
      params.fields = options2.fields;
    }
    if (options2.type) {
      params["filter.type"] = resolveType2(options2.type);
    }
    if (options2.dryRun) {
      const config = getConfig();
      const baseUrl = config.base_url || "https://api.qloo.com";
      runtime.writeOut(JSON.stringify({ method: "GET", url: `${baseUrl}/v2/analysis/compare`, params }, null, 2) + "\n");
      return;
    }
    try {
      const response = await client.analyzeCompare(params);
      runtime.writeOut(formatAnalysis(response, { format }) + "\n");
    } catch (err) {
      failFromError(err, jsonMode);
    }
  });
  program2.command("tags").description("Search and browse Qloo tags").option("-q, --query <text>", "Search query for tags").option("-t, --type <type>", "Tag type to filter (e.g., genre:media, keyword:qloo)").option("-n, --take <n>", "Number of results to return", "10").option("-j, --json", "Output as JSON").option("--plain", "Output as TSV").addHelpText("after", `
Examples:
  qloo tags --query "comedy" --type genre:media
  qloo tags -q "italian" -n 5
`).action(async (options2) => {
    const jsonMode = Boolean(options2.json);
    const client = createClient(program2.opts(), jsonMode);
    const format = getOutputFormat(options2);
    const params = {};
    if (options2.query) {
      params["filter.query"] = options2.query;
    }
    if (options2.type) {
      const typeVal = options2.type.startsWith("urn:") ? options2.type : `urn:tag:${options2.type}`;
      params["filter.tag.types"] = typeVal;
    }
    if (options2.take) {
      params.take = options2.take;
    }
    try {
      const response = await client.searchTags(params);
      const tags = response.results?.tags || [];
      runtime.writeOut(formatTags(tags, { format }) + "\n");
    } catch (err) {
      failFromError(err, jsonMode);
    }
  });
  program2.command("types").description("List all available entity types").option("-j, --json", "Output as JSON").option("--plain", "Output as TSV").addHelpText("after", `
Examples:
  qloo types
  qloo types --json
`).action((options2) => {
    const format = getOutputFormat(options2);
    if (format === "json") {
      runtime.writeOut(JSON.stringify(ENTITY_TYPES, null, 2) + "\n");
      return;
    }
    if (format === "plain") {
      const header2 = ["urn", "name"].join("	");
      const rows2 = ENTITY_TYPES.map((t) => [t.urn, t.name].join("	"));
      runtime.writeOut([header2, ...rows2].join("\n") + "\n");
      return;
    }
    const maxUrnLen = Math.max(...ENTITY_TYPES.map((t) => t.urn.length));
    const headerPlain = `${"TYPE URN".padEnd(maxUrnLen)}  NAME`;
    const header = bold(headerPlain);
    const separator = "-".repeat(maxUrnLen + 20);
    const rows = ENTITY_TYPES.map((t) => `${t.urn.padEnd(maxUrnLen)}  ${t.name}`);
    runtime.writeOut([header, separator, ...rows].join("\n") + "\n");
  });
  const CONFIG_KEYS2 = {
    "api-key": "api_key",
    "base-url": "base_url",
    "taste-resolver-url": "taste_resolver_url"
  };
  const maskApiKey = (value) => value.length <= 8 ? "***" : value.slice(0, 8) + "...";
  program2.command("config").description("Manage Qloo CLI configuration").argument("<action>", "Action: get, set, or unset").argument("[key]", "Config key: api-key, base-url, taste-resolver-url").argument("[value]", "Value to set (for set action)").option("--dry-run", "Preview what would change without writing to disk").addHelpText("after", `
Examples:
  qloo config get
  qloo config set api-key YOUR_API_KEY
  qloo config unset base-url
  qloo config set api-key YOUR_KEY --dry-run
`).action((action, key, value, options2) => {
    const validKeysMsg = `Valid keys: ${Object.keys(CONFIG_KEYS2).join(", ")}`;
    const dryRun = Boolean(options2.dryRun);
    if (action === "get") {
      const config = loadConfig(configPath);
      runtime.writeOut(`Config file: ${configPath}

`);
      if (key) {
        const internalKey = CONFIG_KEYS2[key];
        if (!internalKey) {
          failWith(EXIT_BAD_USAGE, `Unknown key: ${key}
${validKeysMsg}`, false);
        }
        const val = config[internalKey];
        if (val) {
          const displayVal = internalKey === "api_key" ? maskApiKey(val) : val;
          runtime.writeOut(`${key}: ${displayVal}
`);
        } else {
          runtime.writeOut(`${key}: (not set)
`);
        }
        return;
      }
      const entries = Object.entries(CONFIG_KEYS2).map(([cliKey, internalKey]) => {
        const val = config[internalKey];
        if (!val)
          return null;
        const displayVal = internalKey === "api_key" ? maskApiKey(val) : val;
        return `${cliKey}: ${displayVal}`;
      }).filter((line) => line !== null);
      if (entries.length === 0) {
        runtime.writeOut("(no configuration set)\n");
      } else {
        runtime.writeOut(entries.join("\n") + "\n");
      }
      return;
    }
    if (action === "set") {
      if (!key || value === void 0) {
        failWith(EXIT_BAD_USAGE, "Usage: qloo config set <key> <value>", false);
      }
      const internalKey = CONFIG_KEYS2[key];
      if (!internalKey) {
        failWith(EXIT_BAD_USAGE, `Unknown key: ${key}
${validKeysMsg}`, false);
      }
      const displayVal = internalKey === "api_key" ? maskApiKey(value) : value;
      if (dryRun) {
        runtime.writeOut(internalKey === "base_url" ? `Would set and trust ${key} = ${displayVal} (in ${configPath})
` : `Would set ${key} = ${displayVal} (in ${configPath})
`);
        return;
      }
      saveConfigValue(internalKey, value, configPath);
      if (internalKey === "base_url")
        saveConfigValue("trusted_base_url", value, configPath);
      cachedConfig = null;
      runtime.writeOut(`Set ${key} = ${displayVal}
`);
      return;
    }
    if (action === "unset") {
      if (!key) {
        failWith(EXIT_BAD_USAGE, "Usage: qloo config unset <key>", false);
      }
      const internalKey = CONFIG_KEYS2[key];
      if (!internalKey) {
        failWith(EXIT_BAD_USAGE, `Unknown key: ${key}
${validKeysMsg}`, false);
      }
      if (dryRun) {
        runtime.writeOut(`Would unset ${key} (in ${configPath})
`);
        return;
      }
      deleteConfigValue(internalKey, configPath);
      if (internalKey === "base_url")
        deleteConfigValue("trusted_base_url", configPath);
      cachedConfig = null;
      runtime.writeOut(`Unset ${key}
`);
      return;
    }
    failWith(EXIT_BAD_USAGE, `Unknown action: ${action}
Valid actions: get, set, unset`, false);
  });
  program2.command("completions").description("Generate shell completion scripts").argument("<shell>", `Shell to generate completions for (${SUPPORTED_SHELLS.join(", ")})`).action((shell) => {
    const result = generateCompletion(shell);
    if (!result.ok) {
      return failWith(EXIT_BAD_USAGE, result.error, false);
    }
    runtime.writeOut(result.script + "\n");
  });
  program2.command("schema").description("Output machine-readable JSON description of all available commands").action(() => {
    runtime.writeOut(JSON.stringify(buildSchema(program2), null, 2) + "\n");
  });
  program2.command("mcp").description("Start MCP stdio server for AI agent integration (JSON-RPC 2.0)").action(() => {
    const apiKey = getApiKey(program2.opts(), true);
    const config = getConfig();
    const baseUrl = runtime.env.QLOO_BASE_URL?.trim() || config.base_url;
    const environmentTrust = runtime.env.QLOO_TRUSTED_BASE_URL?.trim();
    const allowCustomBaseUrl = !baseUrl || isOfficialQlooBaseUrl(baseUrl) || Boolean(environmentTrust && areEquivalentQlooBaseUrls(baseUrl, environmentTrust)) || Boolean(config.trusted_base_url && areEquivalentQlooBaseUrls(baseUrl, config.trusted_base_url));
    startMcpServer(apiKey, baseUrl, config.taste_resolver_url, {
      input: runtime.stdin,
      writeOut: runtime.writeOut
    }, allowCustomBaseUrl);
  });
  return program2;
};
var runApiCli = async (argv, options = {}) => {
  const runtime = buildRuntime(options);
  return withLogContext(runtime.writeErr, async () => {
    const program2 = createApiCliProgram(options);
    try {
      await program2.parseAsync([...argv], { from: "user" });
      return 0;
    } catch (err) {
      if (err instanceof CliExitError) {
        if (err.jsonMode) {
          runtime.writeOut(`${JSON.stringify(err.toStructuredError())}
`);
        } else {
          runtime.writeErr(`${err.message}
`);
        }
        return err.exitCode;
      }
      if (err instanceof CommanderError) {
        return err.exitCode;
      }
      throw err;
    }
  });
};

// apps/qloo-harness/dist/router.js
import { launchInteractiveHarness } from "./app.js";
import { createQlooArtifactTool } from "./artifact-tool.js";
import { runQlooBuild } from "./build.js";
import { HARNESS_VERSION, runHarnessCli } from "./cli.js";
import { formatDoctorReport, runDoctor } from "./doctor.js";
import { runQlooExec } from "./exec.js";
import { runQlooMcp } from "./mcp.js";
import { createInteractiveIntegrationPlanTool } from "./integration-plan.js";
import { runQlooPlan } from "./plan.js";
import { createQlooToolsFromEnvironment } from "./qloo-tools.js";
import { resolveQlooPaths } from "./paths.js";
import { createProjectContextTool } from "./project-context.js";
import { isQlooHarnessProfile } from "./profiles.js";
import { PINNED_PI_VERSION } from "./runtime/pi-command-policy.js";
import { MissingModelAuthenticationError } from "./runtime/pi-adapter.js";
import { QLOO_NO_GUIDED_START_ENVIRONMENT_VARIABLE, runQlooSetup, setupQloo } from "./setup.js";
import { runQlooUpdate } from "./update-manager.js";
var PI_VERSION = PINNED_PI_VERSION;
var QLOO_HELP = `Qloo terminal agent

Usage:
  qloo                         Start guided Qloo chat (TTY only)
  qloo chat                    Start guided Qloo chat explicitly
  qloo explore                 Grounded Qloo discovery (read-only workspace)
  qloo integrate               Inspect and design a Qloo integration
  qloo plan                    Open interactive read-only planning
  qloo plan "<goal>" --json    Create a typed, evidence-backed plan
  qloo build                   Open interactive approval-gated build
  qloo build --plan <plan-id>  Build from a validated plan
  qloo exec <workflow> [...]   Execute one shared workflow as JSON/JSONL
  qloo setup [options]         Configure Qloo data and a model provider
  qloo doctor [--network]      Inspect local Qloo and model readiness
  qloo doctor --network --json Emit active diagnostics as JSON
  qloo update [options]        Update Qloo and/or its extension packages
  qloo mcp                     Start the canonical nine-workflow MCP server
  qloo api <command> [...]     Run a deterministic Qloo API command
  qloo <legacy-command> [...]  Run a legacy API command unchanged
  qloo --help                  Show this help
  qloo --version               Show the harness version

Examples:
  qloo
  qloo setup
  qloo setup --status --json
  qloo doctor
  qloo update
  qloo update --extensions
  qloo plan "Add taste-based recommendations" --json
  qloo build --plan qplan_<id>
  qloo exec find_tags --input '{"query":"sneakers","limit":1}'
  qloo api search --query "Beyonce" --json
  qloo insights --type movie --signal-entities <entity-id>

Inside chat:
  /journey                     Choose a resumable capability walkthrough
  /journey insight             Natural-language query, refinement, and interpretation
  /journey artifact            Query, inspect /request, and create a private file
  /journey integration         Query, map the project, and create a typed plan
  /request [next|prev|first|latest|number]
                               Inspect API requests made for the latest answer
  /artifacts                   List files created in this session
  /trace [category]            Inspect durable approvals, files, verification, and other events

The authoritative API documentation is https://docs.qloo.com.`;
function discoverLegacyCliShape() {
  const program2 = createApiCliProgram({ writeOut: () => void 0, writeErr: () => void 0 });
  const globalOptions = /* @__PURE__ */ new Map();
  for (const option of program2.options) {
    const consumesValue = option.required || option.optional;
    if (option.short)
      globalOptions.set(option.short, consumesValue);
    if (option.long)
      globalOptions.set(option.long, consumesValue);
  }
  globalOptions.set("-h", false);
  globalOptions.set("--help", false);
  return {
    verbs: new Set(program2.commands.map((command) => command.name())),
    globalOptions
  };
}
var legacyCliShape = discoverLegacyCliShape();
async function launchDefaultChat(profile, options = {}) {
  const cwd = process.cwd();
  const paths = resolveQlooPaths({ cwd, env: process.env });
  if (process.env[QLOO_NO_GUIDED_START_ENVIRONMENT_VARIABLE] !== "1") {
    const setup = await setupQloo({
      env: process.env,
      paths,
      allowLearningMode: true
    });
    if (!setup.model.ready)
      throw new MissingModelAuthenticationError(paths.authFile);
  }
  const customTools = [
    ...createQlooToolsFromEnvironment({ env: process.env }),
    createProjectContextTool({ cwd, paths }),
    createQlooArtifactTool({ artifactsDir: paths.artifactsDir }),
    createInteractiveIntegrationPlanTool({ cwd, paths })
  ];
  return launchInteractiveHarness({
    cwd,
    paths,
    profile,
    customTools,
    ...options.initialMessage === void 0 ? {} : { interactiveOptions: { initialMessage: options.initialMessage } },
    interactiveCommandActions: {
      doctor: (network) => runDoctor({
        env: process.env,
        paths,
        harnessVersion: HARNESS_VERSION,
        piVersion: PI_VERSION,
        network
      })
    }
  });
}
var defaultDependencies = {
  launchChat: launchDefaultChat,
  runApi: (argv, options) => runApiCli(argv, options),
  legacyVerbs: legacyCliShape.verbs,
  legacyGlobalOptions: legacyCliShape.globalOptions,
  doctor: (network) => runDoctor({
    env: process.env,
    harnessVersion: HARNESS_VERSION,
    piVersion: PI_VERSION,
    network
  }),
  runExec: (argv) => runQlooExec(argv, {
    env: process.env,
    stdin: process.stdin,
    stdinIsTTY: process.stdin.isTTY === true,
    writeOut: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text)
  }),
  runPlan: (argv) => runQlooPlan(argv, {
    cwd: process.cwd(),
    env: process.env,
    writeOut: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text)
  }),
  runBuild: (argv) => runQlooBuild(argv, {
    cwd: process.cwd(),
    env: process.env,
    isInteractiveTerminal: () => process.stdin.isTTY === true && process.stdout.isTTY === true,
    writeOut: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
    launch: (_artifact, initialMessage) => launchDefaultChat("build", { initialMessage })
  }),
  runMcp: (argv) => runQlooMcp(argv, {
    env: process.env,
    input: process.stdin,
    writeOut: (text) => process.stdout.write(text),
    serverVersion: HARNESS_VERSION
  }),
  runSetup: (argv) => {
    const paths = resolveQlooPaths({ cwd: process.cwd(), env: process.env });
    return runQlooSetup(argv, {
      env: process.env,
      paths,
      writeOut: (text) => process.stdout.write(text),
      writeError: (text) => process.stderr.write(text)
    });
  },
  runUpdate: (argv, options) => runQlooUpdate(argv, {
    currentVersion: HARNESS_VERSION,
    env: options.env,
    writeOut: options.writeOut,
    writeError: options.writeError
  }),
  isInteractiveTerminal: () => process.stdin.isTTY === true && process.stdout.isTTY === true,
  isOutputTerminal: () => process.stdout.isTTY === true,
  writeOut: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
  env: process.env,
  stdin: process.stdin
};
function routedApiCommandIndex(argv, legacyVerbs, globalOptions) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === void 0)
      return void 0;
    if (argument === "api" || legacyVerbs.has(argument))
      return index;
    const separator = argument.startsWith("--") ? argument.indexOf("=") : -1;
    const optionName = separator > 0 ? argument.slice(0, separator) : argument;
    const consumesValue = globalOptions.get(optionName);
    if (consumesValue === void 0)
      return void 0;
    if (consumesValue && separator < 0) {
      index += 1;
      if (index >= argv.length)
        return void 0;
    }
  }
  return void 0;
}
function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min((current[rightIndex - 1] ?? 0) + 1, (previous[rightIndex] ?? 0) + 1, (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}
function closestCommand(input, commands) {
  const candidates = commands.map((command) => ({ command, distance: editDistance(input, command) })).sort((left, right) => left.distance - right.distance || left.command.localeCompare(right.command));
  const closest = candidates[0];
  if (!closest || closest.distance > Math.max(2, Math.floor(input.length / 3)))
    return void 0;
  return closest.command;
}
async function runQloo(argv = process.argv.slice(2), dependencies = defaultDependencies) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    dependencies.writeOut(`${QLOO_HELP}
`);
    return 0;
  }
  if (argv.length === 1 && (argv[0] === "--version" || argv[0] === "-V")) {
    dependencies.writeOut(`${HARNESS_VERSION}
`);
    return 0;
  }
  const command = argv[0];
  if (command === "plan" && argv.length > 1) {
    return dependencies.runPlan(argv.slice(1));
  }
  if (command === "build" && argv.length > 1) {
    return dependencies.runBuild(argv.slice(1));
  }
  if (command === void 0 || command === "chat" || isQlooHarnessProfile(command)) {
    return runHarnessCli(command === void 0 ? [] : argv, {
      launch: dependencies.launchChat,
      isInteractiveTerminal: dependencies.isInteractiveTerminal,
      writeOut: dependencies.writeOut,
      writeError: dependencies.writeError
    });
  }
  if (command === "doctor") {
    const doctorArgs = argv.slice(1);
    if (doctorArgs.some((argument) => argument !== "--json" && argument !== "--network")) {
      dependencies.writeError("qloo doctor: supported options are --network and --json\n");
      return 2;
    }
    const json = doctorArgs.includes("--json");
    const network = doctorArgs.includes("--network");
    const report = await dependencies.doctor(network);
    dependencies.writeOut(json ? `${JSON.stringify(report)}
` : formatDoctorReport(report));
    return report.status === "ok" ? 0 : 1;
  }
  if (command === "exec") {
    return dependencies.runExec(argv.slice(1));
  }
  if (command === "mcp") {
    const mcpArgs = argv.slice(1);
    const status = await dependencies.runMcp(mcpArgs);
    if (status === 2) {
      dependencies.writeError("qloo mcp: no arguments are supported; use qloo mcp --help\n");
    }
    return status;
  }
  if (command === "setup") {
    return dependencies.runSetup(argv.slice(1));
  }
  if (command === "update") {
    return dependencies.runUpdate(argv.slice(1), {
      env: dependencies.env,
      writeOut: dependencies.writeOut,
      writeError: dependencies.writeError
    });
  }
  const apiOptions = {
    writeOut: dependencies.writeOut,
    writeErr: dependencies.writeError,
    env: dependencies.env,
    stdin: dependencies.stdin,
    stdoutIsTTY: dependencies.isOutputTerminal()
  };
  const routedCommandIndex = routedApiCommandIndex(argv, dependencies.legacyVerbs, dependencies.legacyGlobalOptions);
  const routedCommand = routedCommandIndex === void 0 ? void 0 : argv[routedCommandIndex];
  if (routedCommand === "api" && routedCommandIndex !== void 0) {
    const apiArguments = [
      ...argv.slice(0, routedCommandIndex),
      ...argv.slice(routedCommandIndex + 1)
    ];
    if (apiArguments.length === routedCommandIndex)
      apiArguments.push("--help");
    return dependencies.runApi(apiArguments, apiOptions);
  }
  if (routedCommand !== void 0 && dependencies.legacyVerbs.has(routedCommand)) {
    return dependencies.runApi(argv, apiOptions);
  }
  const available = [
    "chat",
    "explore",
    "integrate",
    "plan",
    "build",
    "exec",
    "setup",
    "doctor",
    "update",
    "api",
    ...dependencies.legacyVerbs
  ];
  const suggestion = closestCommand(command, available);
  dependencies.writeError(`qloo: unknown command "${command}".${suggestion ? ` Did you mean "${suggestion}"?` : ""}

${QLOO_HELP}
`);
  return 2;
}
export {
  PI_VERSION,
  QLOO_HELP,
  runQloo
};
