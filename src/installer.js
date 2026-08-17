/**
 * Turns a catalogue entry into a `dsh plugin add` run.
 *
 * The command is never assembled from free text. The catalogue supplies it
 * already built, and this module validates the shape before handing it to the
 * runner — a store that will execute whatever a remote JSON blob tells it to
 * is a supply-chain hole, not a feature.
 */

const PREFIX = "dsh plugin add ";

// npm names must begin with a letter or digit — which is also what stops a
// relative path from passing as one.
const NPM = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;
const GITHUB = /^github:[\w.-]+\/[\w.-]+(?:#[\w./-]+)?$/;

export class InstallError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "InstallError";
    this.code = code;
  }
}

/**
 * Accepts only the two forms the catalogue can legitimately produce: a bare
 * npm specifier, or `github:owner/repo` with an optional `#subpath`. Anything
 * carrying a shell metacharacter fails here rather than in a shell.
 */
export function planFromCommand(command, fullName) {
  const reject = () => {
    throw new InstallError(
      `Refusing to run an unrecognised install command: ${command}`,
      "UNSAFE_COMMAND",
    );
  };

  if (typeof command !== "string") reject();

  const trimmed = command.trim();
  if (!trimmed.startsWith(PREFIX)) reject();

  const target = trimmed.slice(PREFIX.length);

  // `..` anywhere is a traversal attempt, and neither an npm name nor a
  // GitHub subpath has any legitimate use for it.
  if (target.includes("..")) reject();
  if (!NPM.test(target) && !GITHUB.test(target)) reject();

  return { target, fullName };
}

export function planFromPlugin(plugin) {
  const command = plugin?.install ?? plugin?.installOptions?.[0]?.cmd;
  if (!command) {
    throw new InstallError("Listing has no install command.", "NO_COMMAND");
  }
  return planFromCommand(command, plugin.fullName);
}

/**
 * `dsh plugin` forwards to pnpm inside a profile directory, so `--profile` is
 * required and the profile has to be named explicitly. Arguments go as an
 * array; nothing is ever assembled into a shell string.
 */
export function installArgs(plan, profile) {
  return ["plugin", "--profile", profile, "add", plan.target];
}

export async function installPlan(plan, options) {
  const { runner, execPath, cliPath, profile, signal } = options;

  try {
    const result = await runner(
      execPath,
      [cliPath, ...installArgs(plan, profile)],
      signal,
    );
    return { target: plan.target, stdout: result?.stdout ?? "" };
  } catch (err) {
    // runNativeCommand rejects on any non-zero exit rather than reporting one.
    throw new InstallError(
      err?.stderr?.trim() || err?.message || "dsh plugin add failed",
      "INSTALL_FAILED",
    );
  }
}

/**
 * HTTP surface for the browser half.
 *
 * Node-style `(req, res)`, which is what ctx.webServer hands a route — not the
 * fetch `Request`/`Response` pair. Returning a Response here does nothing and
 * the request simply hangs.
 *
 * Kept deliberately small: it takes a catalogue entry, not a command, so the
 * client cannot widen what runs.
 */
export function createInstallHandler({ install, onInstalled }) {
  return async (req, res) => {
    if (req.method !== "POST") return send(res, 405, { error: "POST only" });

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: "Invalid JSON body." });
    }

    if (body?.confirmed !== true) {
      return send(res, 400, { error: "Install was not confirmed." });
    }

    try {
      const plan = planFromPlugin(body.plugin);
      const result = await install(plan);
      // Best effort and non-blocking: a failed count must never fail an
      // install the user already completed.
      try {
        await onInstalled?.(body.plugin);
      } catch {}
      return send(res, 200, { ok: true, ...result });
    } catch (err) {
      return send(res, err.code === "UNSAFE_COMMAND" ? 400 : 500, {
        error: err.message,
        code: err.code ?? "UNKNOWN",
      });
    }
  };
}

export function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}
