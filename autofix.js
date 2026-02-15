const express = require("express");
const router = express.Router();

router.post("/", async (req, res) => {
  const { instructionsText } = req.body || {};
  if (!instructionsText) {
    return res.status(400).json({ ok: false, error: "Missing instructionsText" });
  }

  const improved =
    instructionsText +
    "\n\nImprovements:\n" +
    "- Add clear task steps.\n" +
    "- Add time limits and submission method.\n" +
    "- Clarify scoring criteria.\n";

  res.json({ ok: true, improvedText: improved });
});

module.exports = router;
