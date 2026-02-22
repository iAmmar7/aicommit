import { describe, it, expect } from "vitest";
import {
  parseArgs,
  buildConfig,
  LOCAL_OLLAMA_URL,
  CLOUD_OLLAMA_URL,
  DEFAULT_LOCAL_MODEL,
  DEFAULT_CLOUD_MODEL,
} from "./config.js";

describe("parseArgs", () => {
  it("returns defaults when no args given", () => {
    expect(parseArgs([])).toEqual({ help: false, version: false });
  });

  it("parses --help", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
  });

  it("parses -h shorthand", () => {
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("parses --version", () => {
    expect(parseArgs(["--version"]).version).toBe(true);
  });

  it("parses -v shorthand", () => {
    expect(parseArgs(["-v"]).version).toBe(true);
  });

  it("parses --model <name>", () => {
    expect(parseArgs(["--model", "mistral"]).model).toBe("mistral");
  });

  it("parses -m shorthand", () => {
    expect(parseArgs(["-m", "codellama"]).model).toBe("codellama");
  });

  it("parses combined flags", () => {
    const result = parseArgs(["--model", "phi3", "--version"]);
    expect(result.model).toBe("phi3");
    expect(result.version).toBe(true);
  });

  it("throws when --model has no value", () => {
    expect(() => parseArgs(["--model"])).toThrow(/requires a model name/);
  });

  it("throws when --model is followed by another flag", () => {
    expect(() => parseArgs(["--model", "--help"])).toThrow(/requires a model name/);
  });

  it("throws on unknown option", () => {
    expect(() => parseArgs(["--unknown"])).toThrow(/Unknown option/);
  });
});

describe("buildConfig", () => {
  it("uses local Ollama when OLLAMA_API_KEY is absent", () => {
    const config = buildConfig({ help: false, version: false }, {});
    expect(config.ollamaUrl).toBe(LOCAL_OLLAMA_URL);
    expect(config.model).toBe(DEFAULT_LOCAL_MODEL);
    expect(config.apiKey).toBeUndefined();
    expect(config.debug).toBe(false);
  });

  it("uses Ollama Cloud when OLLAMA_API_KEY is set", () => {
    const config = buildConfig(
      { help: false, version: false },
      { OLLAMA_API_KEY: "sk-test" }
    );
    expect(config.ollamaUrl).toBe(CLOUD_OLLAMA_URL);
    expect(config.model).toBe(DEFAULT_CLOUD_MODEL);
    expect(config.apiKey).toBe("sk-test");
  });

  it("respects --model override in local mode", () => {
    const config = buildConfig({ help: false, version: false, model: "mistral" }, {});
    expect(config.model).toBe("mistral");
  });

  it("respects --model override in cloud mode", () => {
    const config = buildConfig(
      { help: false, version: false, model: "custom-model" },
      { OLLAMA_API_KEY: "sk-test" }
    );
    expect(config.model).toBe("custom-model");
    expect(config.ollamaUrl).toBe(CLOUD_OLLAMA_URL);
  });

  it("sets debug=true when DEBUG=1", () => {
    const config = buildConfig({ help: false, version: false }, { DEBUG: "1" });
    expect(config.debug).toBe(true);
  });

  it("sets debug=false when DEBUG is absent", () => {
    const config = buildConfig({ help: false, version: false }, {});
    expect(config.debug).toBe(false);
  });
});
