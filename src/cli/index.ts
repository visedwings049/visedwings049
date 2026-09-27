#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import {
  buildManifest,
  createSermon,
  getKeywordsForSermon,
  getSermon,
  importManifestResults,
  listSermons,
  regenerateKeywordPrompt,
  setSermonNotes,
  setSermonStyle,
} from "../core/sermonService.js";
import { endSession, getSession, startSession } from "../core/sessionService.js";
import type { ManifestResult } from "../core/types.js";

const program = new Command();
program
  .name("prophet-sniper")
  .description(
    "Prophet Sniper sermon graphics: turn sermon notes into keyword-triggered, Higgsfield AI-generated looping videos."
  )
  .version("0.1.0");

const sermon = program.command("sermon").description("Manage sermons and their notes");

sermon
  .command("create")
  .requiredOption("-t, --title <title>", "Sermon title")
  .option("-s, --style <style>", "Visual style guide applied to generated prompts", "")
  .action((opts) => {
    const s = createSermon(opts.title, opts.style);
    console.log(`Created sermon ${s.id} - "${s.title}"`);
  });

sermon
  .command("list")
  .action(() => {
    for (const s of listSermons()) {
      console.log(`${s.id}  ${s.title}`);
    }
  });

sermon
  .command("notes")
  .requiredOption("--sermon <id>", "Sermon id")
  .option("--file <path>", "Read raw notes from a text file")
  .option("--text <text>", "Raw notes text (alternative to --file)")
  .action((opts) => {
    const rawNotes = opts.file ? readFileSync(opts.file, "utf-8") : opts.text;
    if (typeof rawNotes !== "string") {
      console.error("Provide --file or --text");
      process.exitCode = 1;
      return;
    }
    const { keywords } = setSermonNotes(opts.sermon, rawNotes);
    console.log(`Parsed ${keywords.length} trigger phrase(s):`);
    for (const k of keywords) {
      console.log(`  [${k.order}] "${k.phrase}"  status=${k.videoStatus}`);
    }
  });

sermon
  .command("style")
  .requiredOption("--sermon <id>", "Sermon id")
  .requiredOption("--set <style>", "Visual style guide, e.g. 'warm cinematic worship visuals'")
  .action((opts) => {
    setSermonStyle(opts.sermon, opts.set);
    console.log("Style updated.");
  });

sermon
  .command("show")
  .requiredOption("--sermon <id>", "Sermon id")
  .action((opts) => {
    const s = getSermon(opts.sermon);
    if (!s) {
      console.error("Sermon not found");
      process.exitCode = 1;
      return;
    }
    console.log(`# ${s.title} (${s.id})\n`);
    for (const seg of s.segments) {
      process.stdout.write(seg.type === "keyword" ? `[[${seg.text}]]` : seg.text);
    }
    console.log("\n\nKeywords:");
    for (const k of getKeywordsForSermon(s.id)) {
      console.log(`  [${k.order}] "${k.phrase}"  status=${k.videoStatus}  model=${k.model} duration=${k.duration}s`);
    }
  });

const keyword = program.command("keyword").description("Manage individual trigger keywords");

keyword
  .command("regen-prompt")
  .requiredOption("--keyword <id>", "Keyword id (see `sermon show`)")
  .option("--offline", "Draft with a local Ollama model instead of the built-in template", false)
  .action(async (opts) => {
    try {
      const k = await regenerateKeywordPrompt(opts.keyword, opts.offline ? "offline-model" : "template");
      console.log(`"${k.phrase}" ->\n${k.animationPrompt}`);
    } catch (err) {
      console.error((err as Error).message);
      process.exitCode = 1;
    }
  });

const manifest = program.command("manifest").description("Export/import Higgsfield generation manifests");

manifest
  .command("export")
  .requiredOption("--sermon <id>", "Sermon id")
  .requiredOption("-o, --out <path>", "Output manifest JSON path")
  .action((opts) => {
    const m = buildManifest(opts.sermon);
    writeFileSync(opts.out, JSON.stringify(m, null, 2), "utf-8");
    console.log(`Wrote manifest with ${m.entries.length} pending video(s) to ${opts.out}`);
    console.log(m.instructions);
  });

manifest
  .command("import")
  .requiredOption("--sermon <id>", "Sermon id")
  .requiredOption("-f, --file <path>", "Results JSON: array of { keywordId?, phrase?, videoPath?, videoUrl? }")
  .action((opts) => {
    const results = JSON.parse(readFileSync(opts.file, "utf-8")) as ManifestResult[];
    const updated = importManifestResults(opts.sermon, results);
    console.log(`Imported ${updated.length} video(s):`);
    for (const k of updated) {
      console.log(`  "${k.phrase}" -> ${k.videoPath}`);
    }
  });

const session = program.command("session").description("Run a live sermon session");

session
  .command("start")
  .requiredOption("--sermon <id>", "Sermon id")
  .option("--base-url <url>", "Base URL of the running server", "http://localhost:4000")
  .action((opts) => {
    const s = startSession(opts.sermon);
    console.log(`Session ${s.id} is live.`);
    console.log(`Control panel: ${opts.baseUrl}/control/${s.sermonId}?session=${s.id}`);
    console.log(`Display window: ${opts.baseUrl}/display/${s.id}`);
  });

session
  .command("end")
  .requiredOption("--session <id>", "Session id")
  .action((opts) => {
    endSession(opts.session);
    console.log("Session ended.");
  });

session
  .command("status")
  .requiredOption("--session <id>", "Session id")
  .action((opts) => {
    const s = getSession(opts.session);
    if (!s) {
      console.error("Session not found");
      process.exitCode = 1;
      return;
    }
    console.log(`status=${s.status} pointer=${s.pointer}`);
    for (const entry of s.log) {
      console.log(`  ${entry.ts}  [${entry.index}] "${entry.phrase}" (${entry.source})`);
    }
  });

program.parseAsync(process.argv);
