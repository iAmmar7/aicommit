import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import * as configModule from "./config.js";
import * as gitModule from "./git.js";
import * as ollamaModule from "./ollama.js";
import * as promptModule from "./prompt.js";
import * as spinnerModule from "./spinner.js";
import { readFileSync } from "fs";
import { GitError, OllamaError } from "./errors.js";

vi.mock("./config.js");
vi.mock("./git.js");
vi.mock("./ollama.js");
vi.mock("./prompt.js");
vi.mock("./spinner.js");
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const defaultConfig = {
  ollamaUrl: "http://localhost:11434/api/generate",
  model: "llama3.1",
  debug: false,
};

describe("run", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let actualReadFileSync: typeof readFileSync;

  beforeAll(async () => {
    const fs = await vi.importActual<typeof import("fs")>("fs");
    actualReadFileSync = fs.readFileSync;
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(readFileSync).mockImplementation(actualReadFileSync as typeof readFileSync);

    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(configModule.parseArgs).mockReturnValue({ help: false, version: false });
    vi.mocked(configModule.buildConfig).mockReturnValue(defaultConfig);
    vi.mocked(gitModule.getStagedDiff).mockReturnValue("diff --git a/foo.ts b/foo.ts\n+hello");
    vi.mocked(ollamaModule.generateCommitMessage).mockResolvedValue("feat: add login");
    vi.mocked(promptModule.promptUser).mockResolvedValue("accept");
    vi.mocked(gitModule.runCommit).mockReturnValue(0);
    vi.mocked(spinnerModule.createSpinner).mockReturnValue({ stop: vi.fn() });
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  async function run(argv?: string[]) {
    const { run: runFn } = await import("./cli.js");
    return runFn(argv);
  }

  it("exits with code 1 when parseArgs throws an Error", async () => {
    vi.mocked(configModule.parseArgs).mockImplementation(() => {
      throw new Error("Unknown option: --bad");
    });
    await expect(run(["--bad"])).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith("Error: Unknown option: --bad");
  });

  it("exits with code 1 when parseArgs throws a non-Error", async () => {
    vi.mocked(configModule.parseArgs).mockImplementation(() => {
      throw "plain string thrown";
    });
    await expect(run(["--bad"])).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith("Error: plain string thrown");
  });

  it("prints help text and returns when --help is passed", async () => {
    vi.mocked(configModule.parseArgs).mockReturnValue({ help: true, version: false });
    await run(["--help"]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("aicommit"));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("prints version from package.json when --version is passed", async () => {
    vi.mocked(configModule.parseArgs).mockReturnValue({ help: false, version: true });
    await run(["--version"]);
    expect(logSpy).toHaveBeenCalledWith(expect.any(String));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("prints 0.0.0 when package.json cannot be read", async () => {
    vi.mocked(configModule.parseArgs).mockReturnValue({ help: false, version: true });
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw new Error("ENOENT: no such file or directory");
    });
    await run(["--version"]);
    expect(logSpy).toHaveBeenCalledWith("0.0.0");
  });

  it("exits with code 1 when getStagedDiff throws GitError", async () => {
    vi.mocked(gitModule.getStagedDiff).mockImplementation(() => {
      throw new GitError("git not found");
    });
    await expect(run()).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith("git not found");
  });

  it("exits with code 1 when getStagedDiff throws a non-GitError", async () => {
    vi.mocked(gitModule.getStagedDiff).mockImplementation(() => {
      throw "spawn failure";
    });
    await expect(run()).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith("spawn failure");
  });

  it("exits with code 1 when diff is empty", async () => {
    vi.mocked(gitModule.getStagedDiff).mockReturnValue("   ");
    await expect(run()).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No staged changes"));
  });

  it("exits with code 1 when generateCommitMessage throws OllamaError", async () => {
    vi.mocked(ollamaModule.generateCommitMessage).mockRejectedValue(
      new OllamaError("Could not connect to Ollama")
    );
    await expect(run()).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith("Could not connect to Ollama");
  });

  it("exits with code 1 when generateCommitMessage throws a non-OllamaError", async () => {
    vi.mocked(ollamaModule.generateCommitMessage).mockRejectedValue("raw string error");
    await expect(run()).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith("raw string error");
  });

  it("runs commit and returns when user accepts the message", async () => {
    vi.mocked(promptModule.promptUser).mockResolvedValue("accept");
    await run();
    expect(gitModule.runCommit).toHaveBeenCalledWith("feat: add login");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("exits with the commit status code when git commit fails after accept", async () => {
    vi.mocked(promptModule.promptUser).mockResolvedValue("accept");
    vi.mocked(gitModule.runCommit).mockReturnValue(128);
    await expect(run()).rejects.toThrow("process.exit(128)");
  });

  it("regenerates and then accepts on second prompt", async () => {
    vi.mocked(ollamaModule.generateCommitMessage)
      .mockResolvedValueOnce("feat: initial")
      .mockResolvedValueOnce("feat: regenerated");
    vi.mocked(promptModule.promptUser)
      .mockResolvedValueOnce("regenerate")
      .mockResolvedValueOnce("accept");
    vi.mocked(gitModule.runCommit).mockReturnValue(0);

    await run();

    expect(ollamaModule.generateCommitMessage).toHaveBeenCalledTimes(2);
    expect(gitModule.runCommit).toHaveBeenCalledWith("feat: regenerated");
  });

  it("exits with code 1 when regeneration throws OllamaError", async () => {
    vi.mocked(ollamaModule.generateCommitMessage)
      .mockResolvedValueOnce("feat: initial")
      .mockRejectedValueOnce(new OllamaError("offline"));
    vi.mocked(promptModule.promptUser).mockResolvedValue("regenerate");

    await expect(run()).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith("offline");
  });

  it("exits with code 1 when regeneration throws a non-OllamaError", async () => {
    vi.mocked(ollamaModule.generateCommitMessage)
      .mockResolvedValueOnce("feat: initial")
      .mockRejectedValueOnce("plain string failure");
    vi.mocked(promptModule.promptUser).mockResolvedValue("regenerate");

    await expect(run()).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith("plain string failure");
  });

  it("runs commit with edited message when user chooses edit", async () => {
    vi.mocked(promptModule.promptUser).mockResolvedValue("edit");
    vi.mocked(promptModule.editMessage).mockResolvedValue("fix: edited message");
    vi.mocked(gitModule.runCommit).mockReturnValue(0);

    await run();

    expect(promptModule.editMessage).toHaveBeenCalledWith("feat: add login");
    expect(gitModule.runCommit).toHaveBeenCalledWith("fix: edited message");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("exits with commit status code when git commit fails after edit", async () => {
    vi.mocked(promptModule.promptUser).mockResolvedValue("edit");
    vi.mocked(promptModule.editMessage).mockResolvedValue("fix: edited");
    vi.mocked(gitModule.runCommit).mockReturnValue(1);

    await expect(run()).rejects.toThrow("process.exit(1)");
  });
});
