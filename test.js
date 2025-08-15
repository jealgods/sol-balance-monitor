const longString =
  "3r8UU3N7fYwHp24hz6Mq8aZPAs3JgwHaVqU839tqUjjQGvNYE28ypXjD9qmMLG2qXubTtFMCQ5hFztiCvCUDgABZ";
const bytes = Buffer.from(longString, "base64");
const first64Bytes = bytes.slice(0, 64);
const result = first64Bytes.toString("base64");

console.log(result);
