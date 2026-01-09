const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 9000;

app.use(cors());

app.use(cors({
  origin: "*" // Allows all origins (safe for now, change later if needed)
}));
 
app.use(express.json());
app.get("/", (req, res) => res.send("✅ Server OK"));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.vvmbcal.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  // await client.connect();
  console.log("✅ MongoDB Connected");

  const db = client.db("ProgressDB");
  const users = db.collection("users");

  // unique email
  // await users.createIndex({ email: 1 }, { unique: true });

  // =========================
  // POST /api/updates
  // =========================
  app.post("/api/updates", async (req, res) => {
    try {
      const { date, name, email, phone, module, needGuidelines } = req.body;

      if (!date || !name || !email || !phone || !module) {
        return res.status(400).json({
          message: "Missing required fields",
        });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanDate = date.trim();
      const cleanModule = module.trim();
      const cleanPhone = phone.trim();

      // check same email + same date
      const existsSameDate = await users.findOne({
        email: cleanEmail,
        "history.date": cleanDate,
      });

      // =========================
      // SAME DATE → APPEND MODULE
      // =========================
      if (existsSameDate) {
        await users.updateOne(
          { email: cleanEmail },
          {
            $set: {
              name,
              phone: cleanPhone,
              lastModule: cleanModule,
              lastDate: cleanDate,
              lastNeedGuidelines: !!needGuidelines,
              updatedAt: new Date(),

              "history.$[d].module": cleanModule,
              "history.$[d].needGuidelines": !!needGuidelines,
              "history.$[d].updatedAt": new Date(),
            },
            $addToSet: {
              "history.$[d].modules": cleanModule,
            },
          },
          { arrayFilters: [{ "d.date": cleanDate }] }
        );

        return res.json({
          ok: true,
          message: "Same day updated (module added)",
        });
      }

      // =========================
      // NEW DATE → NEW ROW
      // =========================
      const newRow = {
        date: cleanDate,
        module: cleanModule,
        modules: [cleanModule],
        needGuidelines: !!needGuidelines,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await users.updateOne(
        { email: cleanEmail },
        {
          $set: {
            name,
            phone: cleanPhone,
            email: cleanEmail,
            lastModule: cleanModule,
            lastDate: cleanDate,
            lastNeedGuidelines: !!needGuidelines,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
          $push: { history: newRow },
        },
        { upsert: true }
      );

      res.json({
        ok: true,
        message: "New day row created",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        message: "Failed to save update",
        error: err.message,
      });
    }
  });

  // =========================
  // GET /api/updates
  // =========================
  app.get("/api/updates", async (req, res) => {
    const data = await users.find({}).sort({ updatedAt: -1 }).toArray();
    res.json(data);
  });

  // =========================
  // DELETE /api/updates
  // =========================
  app.delete("/api/updates", async (req, res) => {
    await users.deleteMany({});
    res.json({ ok: true });
  });
}

run().catch(console.error);

app.listen(port, () =>
  console.log(`🚀 Server running on http://localhost:${port}`)
);
