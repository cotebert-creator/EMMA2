import { interpretMedication } from "./medication-interpreter.mjs";
import { interpretPersonalMemory } from "./personal-memory-interpreter.mjs";
import { replyToPatient } from "./reply.mjs";
import { lookupMedication } from "./rxnorm.mjs";
import "dotenv/config";

import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.disable("x-powered-by");

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.use(
  "/api/realtime",
  express.text({
    type: ["application/sdp", "text/plain"],
    limit: "1mb"
  })
);

app.post("/api/realtime", async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).send("OPENAI_API_KEY is not configured.");
    }

    if (!req.body) {
      return res.status(400).send("Missing SDP offer.");
    }

    const call = await openai.realtime.calls.create({
      sdp: req.body,
      session: {
        type: "realtime",
        model: "gpt-realtime-2.1-mini"
      }
    });

    const answer =
      typeof call.text === "function"
        ? await call.text()
        : typeof call.sdp === "string"
          ? call.sdp
          : typeof call.body?.sdp === "string"
            ? call.body.sdp
            : String(call);

    if (!answer || !answer.includes("v=0")) {
      console.error("Invalid Realtime SDP answer.");
      return res
        .status(502)
        .send("OpenAI returned an invalid voice session.");
    }

    return res
      .type("application/sdp")
      .send(answer);
  } catch (error) {
    console.error(
      "Realtime connection failed:",
      error?.status || error?.message || error
    );

    return res
      .status(500)
      .send("Could not connect to the voice service.");
  }
});

app.post(
  "/api/medication-reference",
  express.json({ limit: "2kb" }),
  async (req, res) => {
    res.set("Cache-Control", "no-store");

    if (
      typeof req.body?.name !== "string" ||
      !/^[\p{L}][\p{L} '-]{1,79}$/u.test(req.body.name)
    ) {
      return res.status(400).json({
        error: "Enter only a medication name."
      });
    }

    try {
      return res.json({
        candidates: await lookupMedication(req.body.name)
      });
    } catch {
      return res.status(503).json({
        error: "Medication reference unavailable."
      });
    }
  }
);

app.post(
  "/api/medication-intent",
  express.json({ limit: "24kb" }),
  async (req, res) => {
    if (!openai) {
      return res.status(503).json({
        error: "AI interpretation unavailable"
      });
    }

    if (
      typeof req.body?.text !== "string" ||
      !req.body.text.trim() ||
      req.body.text.length > 1200
    ) {
      return res.status(400).json({
        error: "Invalid utterance"
      });
    }

    try {
      return res.json(await interpretMedication(openai, req.body));
    } catch {
      return res.status(503).json({
        error: "AI interpretation unavailable"
      });
    }
  }
);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    realtimeConfigured: Boolean(process.env.OPENAI_API_KEY)
  });
});
<<<<<<< HEAD
app.listen(port,host,()=>console.log(`Emma Web POC running at http://localhost:${port}`));
=======

app.post(
  "/api/personal-memory",
  express.json({ limit: "4kb" }),
  async (req, res) => {
    if (!openai) {
      return res.status(503).json({
        error: "Memory interpretation unavailable"
      });
    }

    try {
      return res.json(
        await interpretPersonalMemory(openai, req.body)
      );
    } catch {
      return res.status(503).json({
        error: "Memory interpretation unavailable"
      });
    }
  }
);

app.post(
  "/api/reply",
  express.json({ limit: "24kb" }),
  async (req, res) => {
    if (!openai) {
      return res.status(503).json({
        error: "Conversation unavailable"
      });
    }

    try {
      const reply = await replyToPatient(openai, req.body);

      const speech = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        input: reply.text,
        response_format: "mp3"
      });

      const audioBase64 = Buffer.from(
        await speech.arrayBuffer()
      ).toString("base64");

      return res.json({
        ...reply,
        audioBase64,
        audioContentType: "audio/mpeg"
      });
    } catch (error) {
      console.error(
        "Conversation/TTS failed:",
        error?.status || error?.message || error
      );

      return res.status(503).json({
        error: "Conversation unavailable"
      });
    }
  }
);

>>>>>>> bd347a0e8b1dd59c55efeba81a6bb4d8fdc29620
export default app;
