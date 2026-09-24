import { NextRequest, NextResponse } from "next/server";

// Model TrOCR Microsoft - khusus teks cetak (price tag, dokumen, label)
const HF_MODEL = "microsoft/trocr-large-printed";
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const token = process.env.HUGGINGFACE_API_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "HuggingFace token not configured" }, { status: 500 });
    }

    // Decode base64 image ke binary buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Kirim ke HuggingFace TrOCR API
    const hfResponse = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "x-wait-for-model": "true",
      },
      body: imageBuffer,
    });

    if (!hfResponse.ok) {
      const errText = await hfResponse.text();
      console.error("HuggingFace error:", errText);
      return NextResponse.json({ error: errText }, { status: hfResponse.status });
    }

    const data = await hfResponse.json();

    // TrOCR mengembalikan: [{ generated_text: "13472861" }]
    const rawText: string = Array.isArray(data)
      ? data[0]?.generated_text ?? ""
      : data?.generated_text ?? "";

    return NextResponse.json({ text: rawText.toUpperCase() });
  } catch (err) {
    console.error("OCR Route Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
