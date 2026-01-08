const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 9000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("✅ Server OK"));

const uri = `mongodb+srv://${encodeURIComponent(
  process.env.DB_USER
)}:${encodeURIComponent(
  process.env.DB_PASSWORD
)}@cluster0.vvmbcal.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  await client.connect();
  console.log("✅ MongoDB Connected");

  const db = client.db("ProgressDB");
  const users = db.collection("users"); // 1 user doc per email

  // unique email index
  try {
    await users.createIndex({ email: 1 }, { unique: true });
    console.log("✅ Unique index on email created");
  } catch (e) {
    console.log("⚠️ Index info:", e.message);
  }

  // ✅ POST /api/updates
  // Same email + same date => SAME row, append module to modules[]
  // Same email + new date  => NEW row
  app.post("/api/updates", async (req, res) => {
    try {
      const { date, name, email, needGuidelines } = req.body || {};
      const moduleValue =
        req.body?.module || req.body?.currentModule || req.body?.current_module;

      if (!date || !name || !email || !moduleValue) {
        return res.status(400).json({
          message: "Missing required fields",
          need: ["date", "name", "email", "module"],
          got: req.body,
        });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const cleanDate = String(date).trim();
      const cleanModule = String(moduleValue).trim();

      if (!cleanEmail.includes("@")) {
        return res.status(400).json({ message: "Invalid email address." });
      }

      // check if same email already has history row for same date
      const existsSameDate = await users.findOne({
        email: cleanEmail,
        "history.date": cleanDate,
      });

      // ✅ SAME EMAIL + SAME DATE => update row + add module to modules[]
      if (existsSameDate) {
        await users.updateOne(
          { email: cleanEmail },
          {
            $set: {
              name: String(name).trim(),
              email: cleanEmail,
              updatedAt: new Date(),
              lastModule: cleanModule,
              lastDate: cleanDate,
              lastNeedGuidelines: Boolean(needGuidelines),

              // latest module for that day (for UI "current")
              "history.$[d].module": cleanModule,
              "history.$[d].needGuidelines": Boolean(needGuidelines),
              "history.$[d].updatedAt": new Date(),
            },

            // ✅ keep previous modules (NO LOSS)
            $addToSet: {
              "history.$[d].modules": cleanModule,
            },
          },
          { arrayFilters: [{ "d.date": cleanDate }] }
        );

        return res.json({
          ok: true,
          mode: "same_day_append",
          message: "Same day updated: module added ✅",
        });
      }

      // ✅ NEW DATE => create new row
      const newRow = {
        date: cleanDate,
        module: cleanModule, // latest module for that day
        modules: [cleanModule], // all modules of that day
        needGuidelines: Boolean(needGuidelines),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await users.updateOne(
        { email: cleanEmail },
        {
          $set: {
            name: String(name).trim(),
            email: cleanEmail,
            updatedAt: new Date(),
            lastModule: cleanModule,
            lastDate: cleanDate,
            lastNeedGuidelines: Boolean(needGuidelines),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
          $push: {
            history: newRow,
          },
        },
        { upsert: true }
      );

      return res.json({
        ok: true,
        mode: "new_day_row",
        message: "New day row created ✅",
      });
    } catch (err) {
      console.error("POST /api/updates error:", err);
      return res.status(500).json({
        message: "Failed to save update",
        error: err?.message || String(err),
      });
    }
  });

  // ✅ GET /api/updates
  app.get("/api/updates", async (req, res) => {
    try {
      const result = await users.find({}).sort({ updatedAt: -1 }).toArray();
      res.json(result);
    } catch (err) {
      console.error("GET /api/updates error:", err);
      res.status(500).json({ message: "Failed to load updates" });
    }
  });

  // ✅ DELETE /api/updates (clear all)
  app.delete("/api/updates", async (req, res) => {
    try {
      const result = await users.deleteMany({});
      res.json({ ok: true, deletedCount: result.deletedCount });
    } catch (err) {
      console.error("DELETE /api/updates error:", err);
      res.status(500).json({ message: "Failed to clear updates" });
    }
  });
}

run().catch((e) => console.error("❌ DB error:", e));

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
