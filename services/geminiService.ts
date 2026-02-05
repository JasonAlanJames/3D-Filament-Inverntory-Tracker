
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { FilamentDetails } from "../types";

export const extractFilamentDetails = async (base64Image: string): Promise<FilamentDetails> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Analyze this 3D printer filament label. Extract:
    - Brand (e.g. Inland, Bambu Lab)
    - Material Type (e.g. PLA, PLA+, PETG)
    - Color (e.g. Bone White)
    - Diameter (e.g. 1.75mm)
    - Net Weight/Roll Size (e.g. 1kg)
    - Printing Temperature range
    - Bed Temperature range
    - Barcode (numerical sequence)
    - Price (look for currency symbols or MSRP, e.g. $22.99)

    Return "Unknown" for any missing fields.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image.split(',')[1] || base64Image,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            brand: { type: Type.STRING },
            materialType: { type: Type.STRING },
            color: { type: Type.STRING },
            diameter: { type: Type.STRING },
            weight: { type: Type.STRING },
            printTemp: { type: Type.STRING },
            bedTemp: { type: Type.STRING },
            barcode: { type: Type.STRING },
            price: { type: Type.STRING },
          },
          required: ["brand", "materialType", "color"],
        },
      },
    });

    return JSON.parse(response.text || "{}") as FilamentDetails;
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};

export const queryInventory = async (query: string, sheetData: any[][]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    You are an expert 3D printing inventory assistant.
    Below is the current stock from the user's Google Sheet. 
    The columns are mapped as follows (Column B 'In Stock' has been removed):
    - Column A: Date
    - Column B: Qty (Number of rolls currently in stock)
    - Column C: Brand (e.g. Inland)
    - Column D: Color Name (e.g. BONE WHITE)
    - Column E: Material Type (e.g. PLA+)
    - Column F: Material Specs (Diameter, e.g. 1.75mm)
    - Column G: Roll Size (Weight, e.g. 1kg)
    - Column H: Print Temp (e.g. 205-225°C)
    - Column I: Used Status (Full, Half, etc.)
    - Column J: Barcode
    - Column K: Roll Price (e.g. $22.99)

    Inventory Data (Rows):
    ${JSON.stringify(sheetData)}

    User Question: "${query}"

    Please answer accurately. 
    - If they ask about stock of a specific filament that IS in the list, confirm it is 'In Stock'.
    - If they ask about something NOT in the list, state it is 'Out of Stock. Need to Reorder'.
    - Material type is in Column E. Color is in Column D.
    Provide a professional, concise response.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
    });
    return response.text || "I couldn't process that request.";
  } catch (error) {
    console.error("Gemini Query Error:", error);
    return "Error communicating with AI assistant.";
  }
};
