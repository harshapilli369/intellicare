import express from "express";
import db from "./db.js"; // however you access your DB

const router = express.Router();

router.post("/login", async (req, res) => {
  const { accessCode } = req.body;

  try {
    // Query your database
    const user = await db.query(
      "SELECT id, role FROM users WHERE access_code = $1",
      [accessCode]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ error: "Invalid access code." });
    }

    const foundUser = user.rows[0];

    res.json({
      user: {
        id: foundUser.id,
        role: foundUser.role
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error." });
  }
});

export default router;
