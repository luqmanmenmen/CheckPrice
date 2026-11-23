import { NextRequest, NextResponse } from "next/server";
import { writeTursoStorage } from "@/lib/tursoStorage";
import { dispatchToGitHubRunner } from "@/lib/githubDispatcher";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * /api/upload (Opsi A — Murni Simpan Storage + Dispatch ke Python Engine)
 * Seluruh parsing xlsx/csv di TypeScript dipensiunkan agar satu pintu di python-engine/.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    const session = token ? await verifyToken(token) : null;

    const dispatched = await dispatchToGitHubRunner({
      action: "promo",
      force: true,
      userId: session?.userId || null,
    });

    return NextResponse.json(
      {
        ...dispatched.payload,
        mode: "PYTHON_ENGINE",
        logs: [
          "Sinkronisasi otomatis dialihkan ke Python Engine (GitHub Actions).",
          dispatched.payload?.message || "",
        ].filter(Boolean),
      },
      { status: dispatched.status }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Gagal memicu sinkronisasi Python" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    const session = token ? await verifyToken(token) : null;

    const formData = await request.formData();
    const files = formData.getAll("file") as File[];
    if (!files || files.length === 0) {
      return NextResponse.json({ success: false, error: "File Excel wajib dipilih." }, { status: 400 });
    }

    const batchFolder = `PROMO/MANUAL_${new Date().toISOString().slice(0, 10)}`;
    const uploadedNames: string[] = [];
    const logs: string[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const objectPath = `${batchFolder}/${file.name}`;
      await writeTursoStorage(
        objectPath,
        buffer,
        file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      uploadedNames.push(file.name);
      logs.push(`Terunggah ke Storage: ${objectPath}`);
    }

    const dispatched = await dispatchToGitHubRunner({
      action: "promo",
      force: true,
      userId: session?.userId || null,
    });

    return NextResponse.json(
      {
        ...dispatched.payload,
        success: dispatched.ok,
        mode: "PYTHON_ENGINE",
        files: uploadedNames,
        logs,
        message: `${uploadedNames.length} file diunggah ke Cloud Storage & langsung diproses oleh Python Engine.`,
      },
      { status: dispatched.status }
    );
  } catch (error: any) {
    console.error("[UPLOAD -> PYTHON]", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Gagal mengunggah & memicu Python Engine" },
      { status: 500 }
    );
  }
}
