import { GoogleGenAI, Type } from "@google/genai";
import { BookConfig, Chapter } from "../types";

const getClient = () => {
    const apiKey = localStorage.getItem('gemini_api_key') || process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API Key missing. Please add your Gemini API Key in the settings.");
    }
    return new GoogleGenAI({ apiKey });
};

// Models
const TEXT_MODEL = 'gemini-3-pro-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image'; 

export const generateBookOutline = async (config: BookConfig): Promise<{ title: string; chapters: Omit<Chapter, 'status' | 'id'>[] }> => {
  const ai = getClient();
  
  const formatInstruction = config.format === 'linkedin-carousel' 
    ? "Format: LinkedIn Carousel (Slides). Structure the outline as key 'Slides' or 'Sections' that are punchy and visual."
    : "Format: Standard eBook. Structure standard chapters.";

  const prompt = `
    You are an expert book editor. Create a structured JSON outline for a non-fiction project.
    
    Topic: ${config.topic}
    Target Audience: ${config.audience}
    Tone: ${config.tone}
    Author: ${config.authorName}
    Target Chapter/Section Count: ${config.chapterCount}
    ${formatInstruction}
    
    Output strictly valid JSON. No markdown code blocks.
  `;

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "A catchy, professional title." },
          chapters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Chapter/Slide title" },
                description: { type: Type.STRING, description: "Brief description of contents." }
              },
              required: ["title", "description"]
            }
          }
        },
        required: ["title", "chapters"]
      },
      thinkingConfig: { thinkingBudget: 1024 } 
    }
  });

  let text = response.text || "";
  text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  if (!text) throw new Error("No response from AI");
  
  try {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.chapters)) {
      throw new Error("Invalid structure: 'chapters' array missing");
    }
    return data;
  } catch (e: any) {
    console.error("JSON Parse Error:", text);
    throw new Error(`Failed to parse outline.`);
  }
};

export async function* generateChapterContentStream(
  chapter: Chapter, 
  bookTitle: string, 
  config: BookConfig,
  previousChapterSummary?: string
) {
  const ai = getClient();

  const formatInstruction = config.format === 'linkedin-carousel'
    ? "FORMAT: LinkedIn Carousel. Write short, punchy, high-impact text suitable for slides. Use bullet points heavily. Avoid long paragraphs."
    : "FORMAT: Standard eBook. Write engaging long-form content with good flow.";

  let systemInstruction = `You are a professional writer named ${config.authorName || 'AI'}. You are writing a section for "${bookTitle}".
  Tone: ${config.tone}. Audience: ${config.audience}. 
  ${formatInstruction}
  
  RULES:
  1. Write in Markdown format.
  2. **Visuals**: Use SVG diagrams ONLY when explaining a complex logic, flow, or data structure. Do NOT generate an SVG for simple decorative purposes.
  3. Wrap the SVG code in \`\`\`svg ... \`\`\` blocks.
  4. If an SVG is generated, do not describe it in text immediately before or after, let the diagram speak for itself.
  `;

  if (previousChapterSummary) {
    systemInstruction += `\nContext: The previous section covered: ${previousChapterSummary}. Ensure continuity.`;
  }

  const prompt = `Write the full content for section: "${chapter.title}".
  Description: ${chapter.description}.
  Make it highly visual and interesting.`;

  const tools = config.enableSearch ? [{ googleSearch: {} }] : [];

  const streamResult = await ai.models.generateContentStream({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      systemInstruction,
      tools: tools,
    }
  });

  for await (const chunk of streamResult) {
    const text = chunk.text;
    if (text) {
      yield text;
    }
  }
};

export const generateImage = async (prompt: string, aspectRatio: '3:4' | '16:9' | '4:3' | '1:1' = '16:9'): Promise<string> => {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio,
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image generated");
};

export const generateBookCover = async (title: string, style: string, format: string): Promise<string> => {
  const aspectRatio = format === 'linkedin-carousel' ? '3:4' : '3:4'; // Portrait usually best for both
  const prompt = `A professional, bestseller quality cover for a ${format} titled "${title}".
  Style: ${style}. Minimalist, high contrast, elegant typography, vector art or photorealistic depending on style.
  No text on image except abstract shapes or relevant symbolism.`;
  
  return generateImage(prompt, aspectRatio);
};

export const generateChapterIllustration = async (chapterTitle: string, style: string, format: string): Promise<string> => {
  const aspectRatio = format === 'linkedin-carousel' ? '4:3' : '16:9'; // Carousels often use 4:5 or 1:1, but 4:3 is safer for standard models
  const prompt = `An editorial illustration for a section titled "${chapterTitle}".
  Style: ${style}. Artistic, evocative, clean lines.`;
  
  return generateImage(prompt, aspectRatio);
};