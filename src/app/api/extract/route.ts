import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// Inisialisasi Gemini API
// Pastikan GEMINI_API_KEY ada di .env.local
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export const maxDuration = 60; // Max duration for Vercel Hobby tier, ensuring enough time for AI parsing

export async function POST(request: Request) {
  try {
    const { image } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: "Image data is required" },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === "") {
      return NextResponse.json(
        { error: "Kunci API Gemini (GEMINI_API_KEY) belum diisi dengan benar di file .env.local" },
        { status: 500 }
      );
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      Anda adalah alat pendeteksi teks dari gambar/foto/dokumen/screenshot.
      Tugas utama: mengekstrak 'Nama PT' dan SEMUA 'Nomor Plat' yang ada di gambar.
      
      Aturan ketat:
      1. Nomor Plat: Cari SEMUA pola plat nomor Indonesia (misal B 1234 CD, b 1928 hd). Bersihkan spasi dan rapihkan (uppercase). Jika tidak ada sama sekali, kembalikan array kosong [].
      2. Nama PT: Cari nama perusahaan (misal pt absc). Jika tidak ada, WAJIB kembalikan string kosong "".
      
      Response HARUS berupa objek JSON. Output harus mengandung dua properti berikut:
      {
        "namaPT": "PT ABSC",
        "nomorPlats": ["B 1028 LS", "B 1928 HD", "A 10299 KS"]
      }
    `;

    // Kita berasumsi image yang dikirim berformat base64 (jpeg/png dsb)
    const imageParts = [
      {
        inlineData: {
          data: image,
          mimeType: "image/jpeg" // works for most common image uploads via camera
        }
      }
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();
    
    // Safety check if response contains markdown formatting
    const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    try {
      const parsed = JSON.parse(cleanText);
      return NextResponse.json(parsed);
    } catch (parseError) {
      console.error("JSON parsing failed. Raw response:", text);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: `Internal Server Error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
