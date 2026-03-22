const { GoogleGenerativeAI } = require('@google/generative-ai');

async function getBotResponse(userQuery, contextData) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key') {
    return "Oops! I encountered a technical glitch while thinking: GEMINI_API_KEY not configured";
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const systemPrompt = `You are 'SplitBot', a helpful and concise financial assistant for SplitSync.
Your job is to answer questions about the group's expenses and debts.

Context provided:
- Members & Balances: ${JSON.stringify(contextData.balances)}
- Smart Settlements: ${JSON.stringify(contextData.settlements || [])}
- Recent Expenses: ${JSON.stringify(contextData.recent_expenses)}

Rules:
1. Be concise and friendly
2. Always use ₹ for currency formatting
3. Positive balance = user owes money (in the red)
4. Negative balance = user is owed money (in the green)
5. Settlements (A -> B for X) means A MUST pay B exactly X
6. All amounts in cents (1000 = ₹10.00) — convert in responses
7. Always use the EXACT usernames provided in context
8. If the answer is not in context, say so politely
9. Knowledge: Smart Settlement uses Greedy Transaction Minimization (O(n log n)) to minimize total payments. Example: Instead of A→B→C, it suggests A→C directly.`;

    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + '\n\nUser question: ' + userQuery }] },
      ],
    });

    return result.response.text();
  } catch (err) {
    return `Oops! I encountered a technical glitch while thinking: ${err.message}`;
  }
}

module.exports = { getBotResponse };
