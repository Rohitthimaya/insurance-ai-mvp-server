import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import insuranceRouter from "./routes/insurance";
import mongoose from "mongoose";
import bcrypt from 'bcrypt';
import jwt from "jsonwebtoken";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

console.log(process.env.AIMLAPI)

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());


const planSchema = new mongoose.Schema({
  id: Number,
  provider: String,
  type: String,
  price: Number,
  coverage: String,
  region: String,
  rating: Number,
  term: String,
  benefits: [String],
  cashback: Number,
  icon: String,
  url: String,
});


const SECRET = "your_jwt_secret";

// 1️⃣ Connect to MongoDB
mongoose.connect("mongodb+srv://thimayarohit:Rohit%402728@cluster0.mr1gx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

// 2️⃣ User schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  purchasedPlans: [planSchema], // add this
});

const User = mongoose.model("User", userSchema);

export interface AuthRequest extends Request {
  userId?: string;
}

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try { 
    // use env variable in production
    const decoded = jwt.verify(token, SECRET) as { id: string };
    
    req.userId = decoded.id; // attach user id to request
    next();
  } catch (err) {
    console.error("JWT verification failed:", err);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// 3️⃣ Register
app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "All fields required" });

  const existingUser = await User.findOne({ email });
  if (existingUser) return res.status(400).json({ error: "User already exists" });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ name, email, password: hashedPassword });
  await user.save();

  res.json({ message: "User registered successfully" });
});

// 4️⃣ Login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });
  // @ts-ignore
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

  const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, SECRET, { expiresIn: "1h" });
  res.json({ token });
});


// Routes
app.get("/", (req: Request, res: Response) => {
  res.send("🚀 Insurance API is running");
});

app.post("/buy-plan", verifyToken, async (req: Request, res: Response) => {
  const userId = (req as any).userId; // set by verifyToken middleware
  const { planId, planData } = req.body;

  if (!planId || !planData) {
    return res.status(400).json({ error: "Plan data required" });
  }

  try {
    await User.findByIdAndUpdate(userId, {
      $push: { purchasedPlans: planData },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save plan" });
  }
});

app.post("/query", verifyToken, async (req: AuthRequest, res: Response) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query text is required" });
  }

  try {
    // Fetch user with purchased plans
    const user = await User.findById(req.userId).select("purchasedPlans");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 🔹 Prepare context for AI
    const systemPrompt = `You are an AI insurance assistant. 
The user will provide a question, and you also have access to their purchased insurance plans.
Your task is to analyze the user's query in the context of their purchased plans 
and return a helpful, conversational answer.

User's purchased plans:
${JSON.stringify(user.purchasedPlans, null, 2)}

Important:
- Answer as if you are a customer support agent.
- Refer directly to their purchased plans when relevant.
- Keep responses concise but clear.`;

    // 🔹 Send to AIML API
    const aimlResponse = await axios.post(
      "https://api.aimlapi.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query }
        ],
        max_tokens: 500,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.AIMLAPI}`, // store your key in .env
          "Content-Type": "application/json"
        }
      }
    );

    const answer = aimlResponse.data.choices[0].message.content;

    res.json({
      answer,
      purchasedPlans: user.purchasedPlans
    });

  } catch (err) {
    console.error("Error handling /query:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


app.use("/api/insurance", insuranceRouter);

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
