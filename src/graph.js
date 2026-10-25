import "dotenv/config";

import {
  StateGraph,
  StateSchema,
  START,
  END,
} from "@langchain/langgraph";

import { ChatOpenAI } from "@langchain/openai";
import * as z from "zod";

// Shared LLM used by all three agents.
const model = new ChatOpenAI({
  model: "gpt-4.1-mini",
  temperature: 0,
});

// Shared state passed between graph nodes.
const State = new StateSchema({
  topic: z.string(),
  research: z.string().default(""),
  report: z.string().default(""),
  review: z.string().default(""),
  approved: z.boolean().default(false),
  revisionCount: z.number().default(0),
});

// AGENT 1: Researcher
async function researcher(state) {
  console.log("\n🔎 Researcher running...");

  const response = await model.invoke([
    [
      "system",
      `You are a research agent.
Research the given topic carefully.
Provide key findings, explanations, examples, and caveats.
Be factual and clearly distinguish established facts from uncertainty.
Do not invent sources or citations.`,
    ],
    [
      "human",
      `Research this topic: ${state.topic}`,
    ],
  ]);

  return {
    research: response.content,
  };
}

// AGENT 2: Writer
async function writer(state) {
  console.log("\n✍️ Writer running...");

  const version = state.revisionCount + 1;

  const response = await model.invoke([
    [
      "system",
      `You are a technical report writer.
Write a clear, well-organized report based on the research provided.
Include a title, introduction, main sections, and conclusion.
Do not invent facts or citations.
If reviewer feedback is provided, address it in this revision.`,
    ],
    [
      "human",
      `Topic: ${state.topic}

Research findings:
${state.research}

Previous report, if any:
${state.report || "No previous report."}

Reviewer feedback:
${state.review || "No reviewer feedback yet."}

Write report version ${version}.`,
    ],
  ]);

  return {
    report: String(response.content),
  };
}

// AGENT 3: Reviewer
const ReviewResult = z.object({
  approved: z.boolean().describe(
    "Whether the report is good enough to publish"
  ),
  review: z.string().describe(
    "Specific feedback explaining the decision and improvements needed"
  ),
});

const reviewerModel = model.withStructuredOutput(ReviewResult);

async function reviewer(state) {
  console.log("\n🧑‍⚖️ Reviewer running...");

  // Avoid unlimited revisions.
  const atRevisionLimit = state.revisionCount >= 2;

  const result = await reviewerModel.invoke([
    [
      "system",
      `You are a strict but constructive report reviewer.
Evaluate accuracy, relevance, completeness, clarity, and organization.
Approve the report only if it meets a reasonable quality standard.
If it needs improvement, provide specific actionable feedback.
Do not request fabricated citations or unsupported claims.`,
    ],
    [
      "human",
      `Topic: ${state.topic}

Research:
${state.research}

Report to review:
${state.report}

Revision number: ${state.revisionCount + 1}
${atRevisionLimit
  ? "This is the final review. You MUST approve or reject based on the current report, but no more revisions will be possible."
  : "If the report needs meaningful improvements, reject it and explain what to fix."}`,
    ],
  ]);

  // Increment the count every time the reviewer evaluates a report.
  return {
    approved: result.approved,
    review: result.review,
    revisionCount: state.revisionCount + 1,
  };
}

// Conditional router after review.
function reviewRouter(state) {
  if (state.approved) {
    return "end";
  }

  // Stop after at most three review attempts.
  if (state.revisionCount >= 3) {
    return "end";
  }

  return "revise";
}

// Build the workflow graph.
export const graph = new StateGraph(State)
  .addNode("researcher", researcher)
  .addNode("writer", writer)
  .addNode("reviewer", reviewer)
  .addEdge(START, "researcher")
  .addEdge("researcher", "writer")
  .addEdge("writer", "reviewer")
  .addConditionalEdges("reviewer", reviewRouter, {
    revise: "writer",
    end: END,
  })
  .compile();