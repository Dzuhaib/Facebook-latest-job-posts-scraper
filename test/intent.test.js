import test from "node:test";
import assert from "node:assert/strict";
import { scorePost } from "../src/intent.js";

test("detects a hiring post for web development", () => {
  const result = scorePost(
    "We're hiring a web developer to build our new Shopify store. Budget is $2,500. DM me if you can start this week."
  );
  assert.equal(result.isLead, true);
  assert.ok(result.services.includes("web"));
  assert.ok(result.score >= 8);
});

test("detects automation requests", () => {
  const result = scorePost(
    "I need a Zapier automation to sync Facebook leads into my CRM. Paid gig, can pay today."
  );
  assert.equal(result.isLead, true);
  assert.ok(result.services.includes("automation"));
});

test("detects SEO requests", () => {
  const result = scorePost(
    "Can anyone recommend an SEO expert? We need help ranking on Google for our plumbing business."
  );
  assert.equal(result.isLead, true);
  assert.ok(result.services.includes("seo"));
});

test("detects a short direct request", () => {
  const result = scorePost("Need a website.");
  assert.equal(result.isLead, true);
  assert.deepEqual(result.services, ["web"]);
});

test("rejects agencies selling their own services", () => {
  const result = scorePost("We build websites for small businesses. DM for pricing.");
  assert.equal(result.isLead, false);
  assert.ok(result.score < 4);
});

test("rejects freelance service advertisements", () => {
  const result = scorePost(`I am a professional website developer with 4 year of experience
I services offer for clients
Full stack Custom websites
1. Html
2. Css
3. JavaScript
4. React Js
5. Node Js
6. MongoDB
WordPress websites
1. Elementer pro
2. Wp bakery
3. Wo-commerce
4. E-commerce
5. Gutanburg design
Why choose me?
High quality and responsive work
Timely delivered
On your requirements
I can share my portfolio as well
If you need any type of website
Contact me via whatsapp (link in profile)`);
  assert.equal(result.isLead, false);
  assert.ok(result.matched.seller.length > 0);
});

test("rejects seller contact pitches", () => {
  const result = scorePost("Need a website? DM me for pricing.");
  assert.equal(result.isLead, false);
  assert.ok(result.matched.seller.length > 0);
});

test("rejects seller call-to-action pitches", () => {
  const result = scorePost("Need a website? Let's talk.");
  assert.equal(result.isLead, false);
  assert.ok(result.matched.seller.length > 0);
});

test("keeps buyers who ask for rates", () => {
  const result = scorePost("We need a web developer. Let me know your rate.");
  assert.equal(result.isLead, true);
  assert.deepEqual(result.matched.seller, []);
});

test("rejects self-identified developer ads", () => {
  const result = scorePost("I am a full stack developer. I can build your next website.");
  assert.equal(result.isLead, false);
  assert.ok(result.matched.seller.length > 0);
});

test("rejects agency offer posts", () => {
  const result = scorePost("We offer SEO services. Contact us today.");
  assert.equal(result.isLead, false);
  assert.ok(result.matched.seller.length > 0);
});

test("keeps buyers who ask for a portfolio", () => {
  const result = scorePost(
    "We need a web developer. Send me your portfolio and availability."
  );
  assert.equal(result.isLead, true);
  assert.deepEqual(result.matched.seller, []);
});

test("keeps buyers with experience requirements", () => {
  const result = scorePost(
    "We're hiring a web developer with 3 years of experience. Budget is $2,000."
  );
  assert.equal(result.isLead, true);
  assert.deepEqual(result.matched.seller, []);
});

test("keeps buyers who describe themselves", () => {
  const result = scorePost("I am a business owner looking for a web developer.");
  assert.equal(result.isLead, true);
  assert.deepEqual(result.matched.seller, []);
});

test("rejects tool questions", () => {
  const result = scorePost("Anyone using Shopify for their store? Any tips?");
  assert.equal(result.isLead, false);
});

test("rejects promotional webinar posts", () => {
  const result = scorePost(
    "Automation is changing everything. Learn how AI agents work in our free webinar."
  );
  assert.equal(result.isLead, false);
});

test("rejects job seekers", () => {
  const result = scorePost(
    "Looking for a job as a web developer. Open to work, here is my portfolio."
  );
  assert.equal(result.isLead, false);
});

test("rejects old-style announcements", () => {
  const result = scorePost("Our new website launched today. Check it out!");
  assert.equal(result.isLead, false);
});

test("word boundaries prevent false keyword hits", () => {
  const result = scorePost("Our reaction to the new site was positive.");
  assert.deepEqual(result.services, []);
});

test("supports extra keywords from config", () => {
  const result = scorePost("We need help with a Webflow migration.", {
    extra: { services: { web: ["webflow"] } }
  });
  assert.equal(result.isLead, true);
  assert.ok(result.services.includes("web"));
});

test("custom skills count as services and filter leads", () => {
  const result = scorePost(
    "We need video editing help for a paid project. Budget is $300.",
    { extra: { skills: ["video editing"] } }
  );
  assert.equal(result.isLead, true);
  assert.ok(result.services.includes("video editing"));
  assert.ok(result.matched.skills.includes("video editing"));
});

test("custom skills do not double count built-in categories", () => {
  const result = scorePost("Need a website for my business.", {
    extra: { skills: ["web"] }
  });
  assert.deepEqual(result.services, ["web"]);
  assert.deepEqual(result.matched.skills, []);
});

test("extra negative keywords can suppress a lead", () => {
  const result = scorePost("Looking for SEO help. We are a student group.", {
    extra: { negative: ["student group"] }
  });
  assert.equal(result.isLead, false);
});

test("detects availability-style hiring posts", () => {
  const result = scorePost("Any web developers available for a quick project?");
  assert.equal(result.isLead, true);
  assert.ok(result.services.includes("web"));
});

test("detects ISO-style requests", () => {
  const result = scorePost("ISO SEO expert for a local service business.");
  assert.equal(result.isLead, true);
  assert.ok(result.services.includes("seo"));
});

test("empty text is never a lead", () => {
  const result = scorePost("");
  assert.equal(result.isLead, false);
  assert.equal(result.score, 0);
});
