const express = require("express");
const router = express.Router();

router.post("/", async (req, res) => {
  const { instructionsText } = req.body;

  if (!instructionsText) {
    return res.status(400).json({
      ok: false,
      error: "Missing instructionsText"
    });
  }

  const improved = instructionsText +
    "\n\nImprovement suggestions:\n" +
    "- Add explicit performance criteria.\n" +
    "- Clarify task expectations.\n" +
    "- Include assessment weighting.";

  res.json({
    ok: true,
    improvedText: improved
  });
});

module.exports = router;
