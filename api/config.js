// GET /api/config — tells the frontend whether an access code is required.
module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const codes = (process.env.ACCESS_CODES || "").split(",").map((c) => c.trim()).filter(Boolean);
  res.status(200).json({ requiresAccessCode: codes.length > 0 });
};
