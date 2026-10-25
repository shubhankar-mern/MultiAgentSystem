import "dotenv/config";
import { graph } from "./graph.js";

const topic = "How AI agents are used in software engineering";

console.log("Starting multi-agent research system...");
console.log("Topic:", topic);

const result = await graph.invoke(
  {
    topic,
  },
  {
    // Safety limit for total graph steps.
    recursionLimit: 15,
  }
);

console.log("\n========== FINAL RESULT ==========");
console.log("\nTopic:\n", result.topic);
console.log("\nResearch:\n", result.research);
console.log("\nReport:\n", result.report);
console.log("\nReviewer feedback:\n", result.review);
console.log("\nApproved:", result.approved);
console.log("\nReview attempts:", result.revisionCount);

if (!result.approved) {
  console.log(
    "\nThe report was not approved before the revision limit."
  );
}