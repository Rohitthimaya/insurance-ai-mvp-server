import { Router, Request, Response } from "express";
import {plans} from "./plan";
import OpenAI from "openai";
import axios from "axios";

const router = Router();

// GET all plans
router.get("/", (req: Request, res: Response) => {
  res.json(plans);
});

// GET single plan
router.get("/:id", (req: Request, res: Response) => {
  const plan = plans.find((p) => p.id === Number(req.params.id));
  if (!plan) {
    return res.status(404).json({ message: "Plan not found" });
  }
  res.json(plan);
});


// Initialize OpenAI client
const client = new OpenAI({
  baseURL: "https://api.aimlapi.com/v1",
  apiKey: `${process.env.AIMLAPI}`
});

// Available filters
const FILTERS = {
  types: ["All", "Health", "Life", "Auto", "Home", "Travel"],
  regions: ["All", "ON", "BC", "AB", "MB", "QC", "NS", "NB"],
  terms: ["All", "1 year", "5 years", "1 month"],
  priceRange: { min: 0, max: 500 },
  rating: { min: 0, max: 5 },
  benefits: [
    "Prescription Coverage","Emergency Services","Accidental Death","Terminal Illness",
    "Third-Party Liability","Accident Benefits","Vehicle Damage","Theft Protection",
    "Collision Damage","Family Discounts","Collision","Theft","Liability","Dental","Vision",
    "Fire Protection","Theft Coverage","Natural Disasters","Accident Coverage","Critical Illness",
    "Family Package","Fire","Medical Emergencies","Trip Cancellation","Lost Luggage",
    "Medical","Baggage Loss","Water Damage","Family Discount","Only Cashback"
  ]
};

router.post("/ask", async (req: Request, res: Response) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: "Question is required" });
  }

  console.log("question,", question)

  try {
    const aimlResponse = await axios.post(
      "https://api.aimlapi.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are an AI agent for insurance, replacing human agents. 
    Your job is to read user queries and return relevant filters to help them find insurance plans.
    
    Available filters:
    Types: All, Health, Life, Auto, Home, Travel
    Regions: All, ON, BC, AB, MB, QC, NS, NB
    Terms: All, 1 year, 5 years, 1 month
    Price Range: $0 - $500
    Rating: 0 - 5 (decimals allowed)
    Benefits: Prescription Coverage, Emergency Services, Accidental Death, Terminal Illness, Third-Party Liability, Accident Benefits, Vehicle Damage, Theft Protection, Collision Damage, Family Discounts, Collision, Theft, Liability, Dental, Vision, Fire Protection, Theft Coverage, Natural Disasters, Accident Coverage, Critical Illness, Family Package, Fire, Medical Emergencies, Trip Cancellation, Lost Luggage, Medical, Baggage Loss, Water Damage, Family Discount, Only Cashback
    
    Return ONLY a JSON object with keys: type, region, term, priceRange, minRating, benefits (array), cashbackOnly (boolean). Do NOT return text or explanation.`
          },
          {
            role: "user",
            content: question
          }
        ],
        max_tokens: 500,
        temperature: 0
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.AIMLAPI}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    // Parse GPT response as JSON
    let filters;
    try {
      filters = JSON.parse(aimlResponse.data.choices[0].message.content);
    } catch (e) {
      filters = {};
    }
    
    return res.json(filters);

    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get AI filters" });
  }
});

export default router;
