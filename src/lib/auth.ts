import { jwtVerify, SignJWT } from "jose";

interface SessionPayload {
  userId: string;
  role: string;
  name: string;
  nik: string;
  jobTitle?: string;
}

const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET_KEY || "super-secret-key-maxdisplay-321";
  return new TextEncoder().encode(secret);
};

export async function signToken(payload: SessionPayload): Promise<string> {
  const secret = getJwtSecretKey();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d") // Token expires in 1 day
    .sign(secret);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch (error) {
    return null;
  }
}
