// simple shared groq client instance
import { env } from "../config/env.js";
import { Groq } from "groq-sdk";

const groq = new Groq({
  apiKey: env.GROQ_API_KEY,
});

export default groq;